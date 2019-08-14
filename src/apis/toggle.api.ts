import Axios from 'axios';

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

    async deleteProject(projectId: string | number) : Promise<void> {
        await this.request('DELETE', `projects/${projectId}`);
    }

    async deleteClient(clientId: string | number) : Promise<void> {
        await this.request('DELETE', `clients/${clientId}`);
    }

    async createClient({ name, notes, wid = this.wid }: { name: string, notes?: string; wid?: number }) : Promise<ToggleClient> {
        return (await this.request<ToggleResponse<ToggleClient>>('POST', 'clients', { client: { name, notes, wid } })).data;
    }

    async createProject({ name, wid = this.wid, cid }: { name: string, wid?: number, cid: number }) : Promise<ToggleProject> {
        return (await this.request<ToggleResponse<ToggleProject>>('POST', 'projects', { project: { name, wid, cid } })).data;
    }
}