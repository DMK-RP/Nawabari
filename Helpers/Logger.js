const chalk = require('chalk');

function logInfo(msg, nametag = null) {
    console.log(chalk.blue(`${!nametag ? "[+]" : `[${nametag}]`} [INFO]`) + ' ' + msg);
}

function logWarn(msg, nametag = null) {
    console.log(chalk.yellow(`${!nametag ? "[+]" : `[${nametag}]`} [WARN]`) + ' ' + msg);
}

function logError(msg, nametag = null) {
    console.log(chalk.red(`${!nametag ? "[+]" : `[${nametag}]`} [ERROR]`) + ' ' + msg);
}

module.exports = {
    logInfo,
    logWarn,
    logError
}