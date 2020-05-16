/* Configuation */
const { authToken, userAgent } = require('../config.json');
if (!authToken || !userAgent) { 
    logError('Auth token or User Agent is missing', 'Github'); 
    process.exit(1); 
}

/* Dependencies */
const check = require('check-types');

/* Helpers */
const { logInfo, logOk, logWarn, logError } = require('../Helpers/Logger');

/* Dependencies */
const { Octokit } = require("@octokit/rest");

/* Variable */
const octokit = new Octokit({
    auth: authToken,
    userAgent: userAgent
});

/* Function */
const getContents = (data, callback) => {
    if (!callback) { return; }

    let valid = check.all(check.map(data, { 
        owner: check.nonEmptyString,
        repo: check.nonEmptyString,
        path: check.nonEmptyString
    }));

    if (!valid) { return callback({success: false}); }

    octokit.repos.getContents(data).then(function(response) {
        return callback({
            success: true, 
            sha: response.data.sha,
            path: response.data.path,
            data: response.data.content
        });
    }).catch(function(e) {
        logError(e, 'getContents');
        return callback({success: false, message: e, path: data.path});
    });
}

const createFile = (data, callback) => {
    let valid = check.all(check.map(data, { 
        owner: check.nonEmptyString,
        repo: check.nonEmptyString,
        path: check.nonEmptyString,
        branch: check.nonEmptyString
    }));

    if (!valid) { 
        if (callback) { callback({success: false}); }

        return;
    }

    octokit.repos.createFile({
        owner: data.owner,
        repo: data.repo,
        path: data.path,
        message: 'Synchronize ' + data.path,
        content: data.content,
        branch: data.branch,
    }).then(function(response) {
        if (callback) {
            callback({ success: true });   
        }
    }).catch(function(e) {
        logError(e, 'createFile');

        if (callback) {
            callback({success: false, message: e, path: data.path});
        }
    });
}

const createOrUpdateFile = (data, callback) => {
    let valid = check.all(check.map(data, { 
        owner: check.nonEmptyString,
        repo: check.nonEmptyString,
        path: check.nonEmptyString,
        branch: check.nonEmptyString,
    }));

    if (!valid) { 
        if (callback) { callback({success: false}); }
        
        return;
    }

    octokit.repos.createOrUpdateFile({
        owner: data.owner,
        repo: data.repo,
        path: data.path,
        message: 'Synchronize ' + data.path,
        sha: data.sha,
        content: data.content,
        branch: data.branch
    }).then(function(response) {
        if (callback) {
            callback({ success: true });   
        }
    }).catch(function(e) {
        logError(e, 'createOrUpdateFile');

        if (callback) {
            callback({success: false, message: e, path: data.path});
        }
    });
}

/* Exporting */
module.exports = {
    getContents,
    createOrUpdateFile
}