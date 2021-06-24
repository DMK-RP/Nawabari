/* Configuation */
const { authToken, userAgent } = require('../config.json');
if (!authToken || !userAgent) { 
    logError('Auth token or User Agent is missing', 'Github'); 
    process.exit(1); 
}

/* Dependencies */
const check = require('check-types');

/* Helpers */
const { logError } = require('../Helpers/Logger');

/* Dependencies */
const { Octokit } = require("@octokit/rest");

/* Variable */
const octokit = new Octokit({
    auth: authToken,
    userAgent: userAgent
});

/* Function */
const push = async function ( data ) {
    let response = await octokit.repos.listCommits({ owner: data.owner, repo: data.repo, sha: data.branch, per_page: 1 });
    let latestCommitSha = response.data[0].sha;
    let treeSha = response.data[0].commit.tree.sha;

    // Tree code taken from : https://github.com/gr2m/octokit-create-pull-request/blob/master/lib/create-pull-request.js#L50
    const tree = (
        await Promise.all(
            Object.keys(data.changes.files).map(async (path) => {
                if (data.changes.files[path] === null) {
                    // Deleting a non-existent file from a tree leads to an "GitRPC::BadObjectState" error
                    try {
                        const response = await octokit.request("HEAD /repos/:owner/:repo/contents/:path", {
                            owner: data.owner,
                            repo: data.repo,
                            ref: latestCommitSha,
                            path,
                        });
    
                        return {
                            path,
                            mode: "100644",
                            sha: null,
                        };
                    } catch (error) {
                        return;
                    }
                }
    
                return {
                    path,
                    mode: "100644",
                    content: data.changes.files[path],
                };
            })
        )
    ).filter(Boolean);

    response = await octokit.git.createTree({
        owner: data.owner,
        repo: data.repo,
        base_tree: treeSha,
        tree: tree
    })
    let newTreeSha = response.data.sha;

    response = await octokit.git.createCommit({
        owner: data.owner,
        repo: data.repo,
        message: data.changes.commit,
        tree: newTreeSha,
        parents: [latestCommitSha]
    })
    latestCommitSha = response.data.sha

    return await octokit.git.updateRef({
        owner: data.owner,
        repo: data.repo,
        sha: latestCommitSha,
        ref: `heads/${data.branch}`,
        force: true
    })
}

const getContents = (data) => {
    let valid = check.all(check.map(data, { 
        owner: check.nonEmptyString,
        repo: check.nonEmptyString,
        path: check.nonEmptyString
    }));

    if (!valid) { return { success: false }; }

    octokit.repos.getContents(data).then(function(response) {
        return { success: true, sha: response.data.sha, path: response.data.path, data: response.data.content };
    }).catch(function(e) {
        logError(e, 'getContents');
        return { success: false, message: e, path: data.path };
    });
}

/* Exporting */
module.exports = { getContents, push }