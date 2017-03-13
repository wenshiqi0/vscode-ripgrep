'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const GitHub = require('github-releases');
const ProgressBar = require('progress');
const yauzl = require('yauzl');
const mkdirp = require('mkdirp');

const tmpDir = path.join(os.tmpdir(), 'vscode-ripgrep-cache');
const assetDestinationDir = path.join(__dirname, '../bin');

function download(opts, assetName, downloadDest) {
    return new Promise((resolve, reject) => {
        const github = new GitHub({
            repo: 'roblourens/ripgrep',
            token: opts.token
        });

        github.getReleases({ tag_name: opts.version }, (err, releases) => {
            if (err) return reject(err);

            const release = releases[0];

            if (!release) {
                return reject(new Error('No release ' + opts.version + ' found'));
            }

            const asset = release.assets.find(asset => asset.name === assetName);
            if (!asset) {
                return reject(new Error(`No asset named ${assetName} found`));
            }

            const assetDownloadPath = path.join(downloadDest, assetName);

            github.downloadAsset(asset, (error, istream) => {
                console.log(`Downloading to ${assetDownloadPath}`);
                if (process.stdout.isTTY && !opts.quiet) {
                    const bar = new ProgressBar('↓ ' + asset.name + ' [:bar] :percent', {
                        total: asset.size,
                        width: 20
                    });

                    istream.on('data', chunk => bar.tick(chunk.length));
                } else {
                    console.log('Downloading ' + asset.name + '...');
                }

                const ostream = fs.createWriteStream(assetDownloadPath);
                istream.pipe(ostream);

                istream.on('error', reject);
                ostream.on('error', reject);
                ostream.on('close', () => resolve(assetDownloadPath));
            });
        });
    })
}

function unzip(zipPath, destinationDir) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipFile) => {
            if (err) return reject(err);

            zipFile.readEntry();
            zipFile.on('entry', entry => {
                zipFile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);

                    const destinationPath = path.join(destinationDir, entry.fileName);
                    mkdirp(destinationDir, err => {
                        if (err) return reject(err);
                        readStream.pipe(fs.createWriteStream(destinationPath));

                        // There should only be one entry...
                        readStream.on('end', resolve);
                    });
                });
            });
        });
    })
}

module.exports = opts => {
    if (!opts.version) {
        return Promise.reject(new Error('Missing version'));
    }

    if (!opts.platform) {
        return Promise.reject(new Error('Missing platform'));
    }

    if (!opts.arch) {
        switch (opts.platform) {
            case 'darwin': opts.arch = 'x64'; break;
            case 'win32': opts.arch = 'ia32'; break;
            case 'linux': opts.arch = 'ia32'; break;
        }
    }

    const assetName = ['ripgrep', opts.version, opts.platform, opts.arch].join('-') + '.zip';

    return new Promise((resolve, reject) => {
        mkdirp(tmpDir, err => {
            if (err) return reject(err);

            download(opts, assetName, tmpDir).then(assetDownloadPath => {
                console.log(`Unzipping to ${assetDestinationDir}`);
                unzip(assetDownloadPath, assetDestinationDir)
            }, reject);
        });
    });
}