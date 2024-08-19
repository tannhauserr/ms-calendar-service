// Promisify the pipeline function
const util = require('util');
const stream = require('stream');


const fs = require('fs');
const ytdl = require('ytdl-core');

const pipeline = util.promisify(stream.pipeline);
// Promisify the unlink function
const unlink = util.promisify(fs.unlink);
const createReadStream = util.promisify(fs.createReadStream);




export class FilesUtilService {

    static storeVideoFromYoutube = async (url, path) => {
        try {
            await pipeline(
                ytdl(url),
                fs.createWriteStream(path)
            );

            return path;
        } catch (e) {
            console.log("Error storing video")
            return null;
        }
    }

    static getFile = async (path) => {
        try {
            return await fs.createReadStream(path);
        } catch (e) {
            console.log("Error getting video")
            return null;
        }
    }

    static deleteFile = async (path) => {
        await unlink(path);
    }


    static existFile = async (path) => {
        return await fs.existsSync(path);
    }
}