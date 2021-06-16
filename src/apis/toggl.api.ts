import Axios from 'axios';
import * as qs from 'querystring';
import { Cache, CacheOptions } from '../cache';

export interface TogglClient {
    id: number;
    wid: number;
    name: string;
    notes: string;
    at: string;
}

export interface TogglWorkspace {
    name: string;
    id: number;
}

export interface TogglProject {
    id: number;
    cid: number;
    wid: number;
    name: string;
    active?: boolean;
}

export interface TogglTimeEntry {
    id: number;
    wid: number;
    pid?: number;
    billable: boolean,
    start: string;
    stop: string;
    duration: number;
    description: string;
    tags?: string[]
    at: string;
    duronly: boolean;
}

interface TogglResponse<T> {
    data: T;
}

export class TogglApi {
    protected cache = Cache.create();

    readonly API_URL = 'https://api.track.toggl.com/api/v8/';

    constructor(protected readonly token: string, protected readonly wid?: number) {

    }

    protected async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: any, cacheOptions?: CacheOptions): Promise<T> {
        const key = `TOGGL_${method}${path}`;
        if (method !== 'GET' || !this.cache.has(key, cacheOptions)) {
            const result = await Axios.request<T>({
                method,
                url: `${this.API_URL}${path}`,
                auth: {
                    username: this.token,
                    password: 'api_token'
                },
                data
            }).then(r => r.data);
            if (method === 'GET') {
                this.cache.set(key, result, cacheOptions);
            }
            return result;
        }
        return this.cache.get<T>(key)!;
    }

    getWorkspaces(): Promise<TogglWorkspace[]> {
        return this.request<TogglWorkspace[]>('GET', 'workspaces');
    }

    getClients(): Promise<TogglClient[]> {
        return this.request<TogglClient[]>('GET', 'clients')
    }

    getClientProjects(clientId: string | number): Promise<TogglProject[] | null> {
        return this.request<TogglProject[]>('GET', `clients/${clientId}/projects`);
    }

    getProjects(): Promise<TogglProject[]> {
        return this.request<TogglProject[]>('GET', 'projects');
    }

    async deleteProject(projectId: string | number): Promise<void> {
        await this.request('DELETE', `projects/${projectId}`);
    }

    async deleteClient(clientId: string | number): Promise<void> {
        await this.request('DELETE', `clients/${clientId}`);
    }

    getTimeEntries({ start, end }: { start?: string | Date, end?: string | Date } = {}): Promise<TogglTimeEntry[]> {
        const query = qs.stringify({
            start_date: start instanceof Date ? start.toISOString() : start,
            end_date: end instanceof Date ? end.toISOString() : end
        })
        return this.request<TogglTimeEntry[]>('GET', `time_entries?${query}`, undefined, { mode: 'never' });
    }

    async createClient({ name, notes, wid = this.wid }: { name: string, notes?: string; wid?: number }): Promise<TogglClient> {
        return (await this.request<TogglResponse<TogglClient>>('POST', 'clients', { client: { name, notes, wid } })).data;
    }

    async updateClient(id: string|number, { name, notes, wid = this.wid }: { name: string, notes?: string; wid?: number }): Promise<TogglClient> {
        return (await this.request<TogglResponse<TogglClient>>('PUT', `clients/${id}`, { client: { name, notes, wid } })).data;
    }

    async createProject({ name, wid = this.wid, cid, active }: { name: string, wid?: number, cid: number, active?: boolean }): Promise<TogglProject> {
        return (await this.request<TogglResponse<TogglProject>>('POST', 'projects', { project: { name, wid, cid, active } })).data;
    }

    async updateProject(id: string|number, { name, wid = this.wid, cid, active }: { name: string, wid?: number, cid: number, active?: boolean }): Promise<TogglProject> {
        return (await this.request<TogglResponse<TogglProject>>('PUT', `projects/${id}`, { project: { name, wid, cid, active } })).data;
    }
}