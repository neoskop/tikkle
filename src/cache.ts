import * as path from 'path';
import * as fs from 'fs-extra';

export type CacheMode = 'persist' | 'memory' | 'disk-only' | 'never';

export interface CacheOptions {
    mode?: CacheMode;
}

export class Cache {
    protected cache = new Map<string, any>();

    protected static instance?: Cache;
    static create() {
        if(!this.instance) {
            this.instance = new Cache();
        }
        return this.instance;
    }

    protected constructor() {}

    clear() {
        this.cache.clear();
        fs.removeSync(this.getCachePath());
    }

    getCachePath(p?: string) {
        if(!p) {
            return path.join(process.env.HOME!, '.tikkle');
        }
        return path.join(process.env.HOME!, '.tikkle', `${p.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
    }

    has(key : string, { mode = 'persist' }: CacheOptions = {}) : boolean {
        if(mode === 'persist' || mode === 'memory') {
            if(this.cache.has(key)) {
                return true;
            }
        }

        if(mode === 'persist' || mode === 'disk-only') {
            if(fs.pathExistsSync(this.getCachePath(key))) {
                return true
            }
        }

        return false;
    }

    get<T>(key: string, { mode = 'persist' }: CacheOptions = {}) : T|undefined {
        if((mode === 'persist' || mode === 'memory') && this.cache.has(key)) {
            return this.cache.get(key);
        }

        if((mode === 'persist' || mode === 'disk-only') && fs.pathExistsSync(this.getCachePath(key))) {
            const result = JSON.parse(fs.readFileSync(this.getCachePath(key), 'utf8'));
            if(mode !== 'disk-only') {
                this.cache.set(key, result);
            }
            return result;
        }

        return
    }

    set(key: string, value: any, { mode = 'persist' }: CacheOptions = {}) {
        if(mode === 'persist' || mode === 'memory') {
            this.cache.set(key, value);
        }
        if(mode === 'persist' || mode === 'disk-only') {
            fs.mkdirpSync(this.getCachePath());
            fs.writeFileSync(this.getCachePath(key), JSON.stringify(value));
        }
    }
}