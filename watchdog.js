/* Configuation */
const { 
    secret, 
    port, 
    syncAccountName, 
    sync
} = require('./config.json');
if (!secret || !port || !syncAccountName || !sync) { return; }

/* Dependencies */
const _ = require('lodash');
const path = require('path');
const async = require('async');
const Base64 = require('js-base64').Base64;
const { Webhooks } = require("@octokit/webhooks");

/* Components */
const { 
    getContents,
    push,
    createBlob
} = require('./Components/Github');

/* Helpers */
const { logInfo, logOk, logWarn, logError } = require('./Helpers/Logger');
const { config } = require('process');

/* Variable */
const webhooks = new Webhooks({
    secret: secret
});

/* Function */
function changedFiles(files, syncInfo) {
    let commits = [];
    let tree = {
        owner: syncInfo.destination.owner,
        repo: syncInfo.destination.repository,
        branch: syncInfo.destination.branch,
        changes : {
            files: {},
            commit: ''
        }
    }

    async.each(files, function(data, cb) {
        if (commits.indexOf(data.commit) == -1) {
            commits.push(data.commit);
        }

        let changes = null;

        if (data.data) {
            changes = Base64.decode(data.data);
        }

        let mergePath = data.path;
        if (syncInfo.source.src) {
            mergePath = mergePath.replace(syncInfo.source.src, '');
            mergePath = path.join(syncInfo.destination.dist, mergePath).replace(/\\/g, "/")
        }
        
        tree.changes.files[mergePath] = changes;
        cb();
    }, async function() {
        tree.changes.commit = `${syncInfo.commitPrefix} Sync (${commits.join(", ")})`
        return await push(tree);
    });
}

/* Event */
webhooks.on("push", ({ id, name, payload }) => {
    const signature = webhooks.sign(payload);
    const verify = webhooks.verify(payload, signature);
    if (!verify) { return; }
    if (payload.pusher.name.toLowerCase() === syncAccountName.toLowerCase()) { return; }
    
    const owner = payload.repository.owner.name;
    const repo = payload.repository.name;

    const found = _.find(sync, function(o) { return o.source.owner.toLowerCase() == owner.toLowerCase() && o.source.repository.toLowerCase() == repo.toLowerCase() });
    if (!found) { return; }

    logInfo(`Got the push event (${id})`, 'webhooks');
    
    const commits = payload.commits;
    if (commits.length <= 0) { return; }

    let Filestochange = [];
    async.eachLimit(commits, 1, function(commit, cb) {
        let prepare = {
            modified: commit.modified,
            removed: commit.removed,
            added: commit.added
        }

        if (prepare.modified.length <= 0 && prepare.removed.length <= 0 && prepare.added.length <= 0) { return cb(); }

        let configPath;
        if (found.source.src) {
            configPath = path.parse(found.source.src);
        }

        async.parallel([
            function(callback) {
                async.each(prepare.removed, function(commitPath, cb) {
                    let parsedPath;

                    if (configPath) {
                        parsedPath = path.parse(commitPath);
                    }

                    if (parsedPath && !parsedPath.dir.includes(configPath.dir)) {
                        return cb();
                    }

                    Filestochange.push({ 
                        path: commitPath,
                        commit: commit.id.substring(0,7), 
                        data: null
                    });
                    
                    cb();
                }, callback);
            },
            function(callback) { 
                let merge = prepare.modified.concat(prepare.added);

                async.eachLimit(merge, 1, function(commitPath, cb) {
                    let parsedPath;
                    if (configPath) {
                        parsedPath = path.parse(commitPath);
                    }

                    if (parsedPath && !parsedPath.dir.includes(configPath.dir)) {
                        return cb();
                    }
                    
                    getContents({ 
                        owner: owner,
                        repo: repo,
                        path: commitPath,
                    }, function(res) {
                        if (res.success && res.path && res.data) {
                            Filestochange.push({ 
                                path: res.path,
                                commit: commit.id.substring(0,7), 
                                data: res.data
                            });
                        } else {
                            //TODO: Send discord alert
                            logError(`Error while pulling contents : ${res.message} | (Files : ${res.path})`, 'getContents')
                        }
        
                        cb();
                    });
                }, callback)
            }
        ], function() {
            cb();
        });
    }, function(res) {
        changedFiles(Filestochange, found);
    });
});

/* Listener */
require("http").createServer(webhooks.middleware).listen(port);
