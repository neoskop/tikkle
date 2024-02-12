import Axios from 'axios';
import * as qs from 'querystring';
import { Cache, CacheOptions } from '../cache';
import assert from 'node:assert';

export interface TogglClient {
    id: number;
    wid: number;
    name: string;
    // notes: string;
    at: string;
}

export interface TogglWorkspace {
    id: number;
    name: string;
    organization_id: number;
}

export interface TogglProject {
    id: number;
    cid: number;
    wid: number;
    name: string;
    active?: boolean;
    client_ids?: number[];
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

export interface ToggleMe {
    workspaces: TogglWorkspace[]
}

// interface TogglResponse<T> {
//     data: T;
// }

export class TogglApi {
    protected cache = Cache.create();

    readonly API_URL = 'https://api.track.toggl.com/api/v9/';

    constructor(protected readonly token: string, protected readonly workspaceId?: number) {

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

    me(): Promise<ToggleMe> {
        return this.request<ToggleMe>('GET', 'me?with_related_data=true');
    }

    // getWorkspaces(): Promise<TogglWorkspace[]> {
    //     return this.request<TogglWorkspace[]>('GET', 'workspaces');
    // }

    getClients(): Promise<TogglClient[]> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        return this.request<TogglClient[]>('GET', `workspaces/${this.workspaceId}/clients`)
    }

    async getClientProjects(clientId: number): Promise<TogglProject[] | null> {
        
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        const projects = await this.request<TogglProject[]>('GET', `workspaces/${this.workspaceId}/projects?client_ids=${clientId}`);
        return projects;

        return projects.filter(p => p.client_ids?.includes(clientId))
    }

    getProjects(): Promise<TogglProject[]> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        return this.request<TogglProject[]>('GET', `workspaces/${this.workspaceId}/projects`);
    }

    async deleteProject(projectId: string | number): Promise<void> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        await this.request('DELETE', `workspaces/${this.workspaceId}/projects/${projectId}`);
    }

    async deleteClient(clientId: string | number): Promise<void> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        await this.request('DELETE', `workspaces/${this.workspaceId}/clients/${clientId}`);
    }

    getTimeEntries({ start, end }: { start?: string | Date, end?: string | Date } = {}): Promise<TogglTimeEntry[]> {
        const query = qs.stringify({
            start_date: start instanceof Date ? start.toISOString() : start,
            end_date: end instanceof Date ? end.toISOString() : end
        })
        return this.request<TogglTimeEntry[]>('GET', `me/time_entries?${query}`, undefined, { mode: 'never' });
    }

    async createClient({ name, wid = this.workspaceId }: { name: string, wid?: number }): Promise<TogglClient> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        return await this.request<TogglClient>('POST', `workspaces/${this.workspaceId}/clients`, { name, wid });
    }

    async updateClient(id: string|number, { name, wid = this.workspaceId }: { name: string, notes?: string; wid?: number }): Promise<TogglClient> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        return await this.request<TogglClient>('PUT', `workspaces/${this.workspaceId}/clients/${id}`, { name, wid });
    }

    async createProject({ name, client_id, active }: { name: string, client_id: number, active?: boolean }): Promise<TogglProject> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        return await this.request<TogglProject>('POST', `workspaces/${this.workspaceId}/projects`, { name, client_id, active });
    }

    async updateProject(id: string|number, { name, client_id, active }: { name: string, client_id: number, active?: boolean }): Promise<TogglProject> {
        assert(this.workspaceId, 'workspaceId must be set, run "tikkle init" to fix this');
        return await this.request<TogglProject>('PUT', `workspaces/${this.workspaceId}/projects/${id}`, { name, client_id, active });
    }
}