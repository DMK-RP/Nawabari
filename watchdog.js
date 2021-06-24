/* Configuation */
const { secret, port, syncAccountName, sync } = require('./config.json');
if (!secret || !port || !syncAccountName || !sync) { return; }

/* Dependencies */
const { find } = require('lodash');
const path = require('path');
const Base64 = require('js-base64').Base64;
const { Webhooks } = require("@octokit/webhooks");

/* Components */
const { getContents, push } = require('./Components/Github');

/* Helpers */
const { logInfo, logError } = require('./Helpers/Logger');

/* Variable */
const webhooks = new Webhooks({ secret: secret });

/* Function */
async function changedFiles(files, syncInfo) {
    const commits = [];
    let tree = {
        owner: syncInfo.destination.owner,
        repo: syncInfo.destination.repository,
        branch: syncInfo.destination.branch,
        changes : {
            files: {},
            commit: ''
        }
    }

    for (const file of files) {
        if (commits.indexOf(file.commit) == -1) {
            commits.push(file.commit);
        }

        let changes = null;
        if (file.data) {
            changes = Base64.decode(file.data);
        }

        let mergePath = file.path;
        if (syncInfo.source.src) {
            mergePath = mergePath.replace(syncInfo.source.src, '');
        }

        tree.changes.files[path.join(syncInfo.destination.dist, mergePath).replace(/\\/g, "/")] = changes;
    }

    tree.changes.commit = `${syncInfo.commitPrefix} Sync (${commits.join(", ")})`
    return await push(tree);
}

/* Event */
webhooks.on("push", async ({ id, name, payload }) => {
    const signature = webhooks.sign(payload);
    const verify = webhooks.verify(payload, signature);
    if (!verify) { return; }
    if (payload.pusher.name.toLowerCase() === syncAccountName.toLowerCase()) { return; }
    
    const owner = payload.repository.owner.name;
    const repo = payload.repository.name;
    const branch = payload.ref.replace("refs/heads/", "");

    const found = find(sync, function(o) { 
        return o.source.owner.toLowerCase() == owner.toLowerCase() && 
            o.source.repository.toLowerCase() == repo.toLowerCase() &&
            o.source.branch.toLowerCase() == branch.toLowerCase()
    });
    if (!found) { return; }

    logInfo(`Got the push event (${id})`, 'webhooks');
    
    const commits = payload.commits;
    if (commits.length <= 0) { return; }

    const filesToChange = [];
    for await (const commit of commits) {
        if (commit.modified.length <= 0 && commit.removed.length <= 0 && commit.added.length <= 0) { continue; }

        let configPath;
        if (found.source.src) {
            configPath = path.parse(found.source.src);
        }

        for (const commitPath of commit.removed) {
            let parsedPath;
            if (configPath) {
                parsedPath = path.parse(commitPath);
            }

            if (parsedPath && !parsedPath.dir.includes(configPath.dir)) {
                continue;
            }

            filesToChange.push({ path: commitPath, commit: commit.id.substring(0,7), data: null });
        }

        const merged = commit.modified.concat(commit.added);
        for await (const commitPath of merged) {
            let parsedPath;
            if (configPath) {
                parsedPath = path.parse(commitPath);
            }

            if (parsedPath && !parsedPath.dir.includes(configPath.dir)) {
                continue;
            }

            try {
                const res = await getContents({ owner: owner, repo: repo, path: commitPath, ref: payload.ref });
                if (res.success && res.path && res.data) {
                    filesToChange.push({ path: res.path, commit: commit.id.substring(0,7), data: res.data });
                } else {
                    //TODO: Send discord alert
                    logError(`Error while pulling contents : ${res.message} | (Files : ${res.path})`, 'getContents')
                }
            } catch (error) {
                logError(`Error while pulling contents : ${error.message}`, 'getContents')
            }
        }
    }

    changedFiles(filesToChange, found);
});

/* Listener */
require("http").createServer(webhooks.middleware).listen(port);
