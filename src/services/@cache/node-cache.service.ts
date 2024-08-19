import NodeCache from "node-cache";
import { handleCacheDelete } from "./cache-event-handles";

export class NodeCacheService {
    private static _instance: NodeCacheService;
    private nodeCache: NodeCache;

    private constructor() {
        this.nodeCache = new NodeCache();

        // this.nodeCache.on('expired', handleCacheExpiration);
        this.nodeCache.on('del', handleCacheDelete);


        // this.nodeCache.on('set', (key, value) => {
        //     console.log(`Se ha establecido la clave "${key}" con el valor "${value}".`);
        // });
    }

    public static get instance() {
        if (!this._instance) {
            this._instance = new NodeCacheService();
        }
        return this._instance;
    }

    public getNodeCache() {
        return this.nodeCache;
    }
}


