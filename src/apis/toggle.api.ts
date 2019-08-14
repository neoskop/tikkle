import Axios from 'axios';
import * as qs from 'querystring';

export interface ToggleClient {
    id: number;
    wid: number;
    name: string;
    notes: string;
    at: string;
}

export interface ToggleWorkspace {
    name: string;
    id: number;
}

export interface ToggleProject {
    id: number;
    cid: number;
    wid: number;
    name: string;
}

export interface ToggleTimeEntry {
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

interface ToggleResponse<T> {
    data: T;
}

export class ToggleApi {
    readonly API_URL = 'https://www.toggl.com/api/v8/';

    constructor(protected readonly token: string, protected readonly wid?: number) {

    }

    protected request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, data?: any): Promise<T> {
        return Axios.request<T>({
            method,
            url: `${this.API_URL}${path}`,
            auth: {
                username: this.token,
                password: 'api_token'
            },
            data
        }).then(r => r.data);
    }

    getWorkspaces() : Promise<ToggleWorkspace[]> {
        return this.request<ToggleWorkspace[]>('GET', 'workspaces');
    }

    getClients() : Promise<ToggleClient[]> {
        return this.request<ToggleClient[]>('GET', 'clients')
    }

    getClientProjects(clientId: string | number) : Promise<ToggleProject[]|null>{
        return this.request<ToggleProject[]>('GET', `clients/${clientId}/projects`);
    }

    getProjects() : Promise<ToggleProject[]> {
        return this.request<ToggleProject[]>('GET', 'projects');
    }

    async deleteProject(projectId: string | number) : Promise<void> {
        await this.request('DELETE', `projects/${projectId}`);
    }

    async deleteClient(clientId: string | number) : Promise<void> {
        await this.request('DELETE', `clients/${clientId}`);
    }

    getTimeEntries({ start, end } : { start?: string|Date, end?: string|Date } = {}) : Promise<ToggleTimeEntry[]> {
        const query = qs.stringify({
            start_date: start instanceof Date ? start.toISOString() : start,
            end_date: end instanceof Date ? end.toISOString() : end
        })
        return this.request<ToggleTimeEntry[]>('GET', `time_entries?${query}`);
    }

    async createClient({ name, notes, wid = this.wid }: { name: string, notes?: string; wid?: number }) : Promise<ToggleClient> {
        return (await this.request<ToggleResponse<ToggleClient>>('POST', 'clients', { client: { name, notes, wid } })).data;
    }

    async createProject({ name, wid = this.wid, cid }: { name: string, wid?: number, cid: number }) : Promise<ToggleProject> {
        return (await this.request<ToggleResponse<ToggleProject>>('POST', 'projects', { project: { name, wid, cid } })).data;
    }
}