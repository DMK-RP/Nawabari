/* Configuation */
const { 
    secret, 
    port, 
    syncAccountName, 
    sync 
} = require('./config.json');
if (!secret || !port || !syncAccountName || !sync) { return; }

/* Dependencies */
const path = require('path');
const async = require('async');
const { Webhooks } = require("@octokit/webhooks");

/* Components */
const { 
    getContents,
    createOrUpdateFile,
} = require('./Components/Github');

/* Helpers */
const { logInfo, logOk, logWarn, logError } = require('./Helpers/Logger');

/* Variable */
const webhooks = new Webhooks({
    secret: "LiBMqqCZeQ7oMSRikZ6ctJYi8j8pMqrJ"
});

/* Function */
function changedFiles(files) {
    async.eachOfLimit(files, 1, function(data, key_path, cb) {
        if (!data || !key_path) {
            return cb();
        }

        getContents({ 
            owner: sync.destination.owner,
            repo: sync.destination.repository,
            path: path.join(sync.destination.dist, key_path).replace(/\\/g, "/"),
            ref: sync.destination.branch
        }, function(res) {
            res.data = data
            cb(res);
        })
    }, function(res) {
        createOrUpdateFile({
            owner: sync.destination.owner, 
            repo: sync.destination.repository, 
            path: res.path, 
            sha: res.sha || null,
            branch: sync.destination.branch, 
            content: res.data
        })
    });
}

/* Event */
webhooks.on("push", ({ id, name, payload }) => {
    let owner = payload.repository.owner.name;
    let repo = payload.repository.name;

    if (owner !== sync.source.owner || repo !== sync.source.repository) { return; }

    let signature = webhooks.sign(payload);
    let verify = webhooks.verify(payload, signature);
    if (!verify) { return; }

    logInfo(`Got the push event (${id})`, 'webhooks');
    if (payload.pusher.name.toLowerCase() === syncAccountName.toLowerCase()) { return; }
    
    let commits = payload.commits;
    if (commits.length <= 0) { return; }

    let Filestochange = {};

    async.eachLimit(commits, 1, function(commit, cb) {
        let modified = commit.modified;
        if (modified.length <= 0) { return cb(); }

        async.eachLimit(modified, 1, function(path, cb) {
            getContents({ 
                owner: owner,
                repo: repo,
                path: path,
            }, cb)
        }, function(res) {
            if (res.success && res.path && res.data) {
                Filestochange[res.path] = res.data;
            } else {
                //TODO: Send discord alert
                logError(`Error while pulling contents : ${res.message} | (Files : ${res.path})`, 'getContents')
            }

            cb();
        });
    }, function(res) {
        changedFiles(Filestochange);
    });
});

/* Listener */
require("http").createServer(webhooks.middleware).listen(port);