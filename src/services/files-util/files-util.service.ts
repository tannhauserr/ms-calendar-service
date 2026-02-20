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

    static storeVideoFromYoutube = async (url: string, path: string): Promise<string | null> => {
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

    static getFile = async (path: string): Promise<NodeJS.ReadableStream | null> => {
        try {
            return await fs.createReadStream(path);
        } catch (e) {
            console.log("Error getting video")
            return null;
        }
    }

    static deleteFile = async (path: string): Promise<void> => {
        await unlink(path);
    }


    static existFile = async (path: string): Promise<boolean> => {
        return fs.existsSync(path);
    }
}
