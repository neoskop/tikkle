import Axios from 'axios';

export interface TickspotRole {
    subscription_id: number;
    company: string;
    api_token: string;
}

export interface TickspotClient {
    id: number;
    name: string;
    archive: boolean;
    url: string;
    updated_at: string;
}

export interface TickspotProject {
    id: number;
    name: string
    budget: number;
    date_closed: string | null;
    notifications: boolean;
    billable: boolean;
    recurring: boolean;
    client_id: number;
    owner_id: number;
    url: string;
    created_at: string;
    updated_at: string;
}

export interface TickspotTask {
    id: string;
    name: string;
    budget: number;
    position: number;
    project_id: number;
    date_closed: string | null;
    billable: boolean;
    url: string;
    created_at: string;
    updated_at: string;
  }

export class TickspotApi {
    readonly API_DOMAIN = 'https://www.tickspot.com';
    readonly API_PATH = '/api/v2/';
    readonly USER_AGENT = 'Tikkle'

    protected cache = new Map<string, Promise<any>>();

    constructor(protected readonly role?: TickspotRole,
        protected readonly username?: string) { }

    protected request<T>(method: 'GET' | 'POST', path: string): Promise<T> {
        if (!this.role) {
            throw new Error('Role configuration required');
        }
        const key = `${method}${path}`;
        if(!this.cache.has(key)) {
            this.cache.set(key, Axios.request<T>({
                method,
                url: `${this.API_DOMAIN}/${this.role.subscription_id}${this.API_PATH}${path}`,
                headers: {
                    'Authorization': `Token token=${this.role!.api_token}`,
                    'User-Agent': `${this.USER_AGENT} <${this.username}>`
                }
            }).then(r => r.data));
        }
        return this.cache.get(key)!;
    }

    getClients(): Promise<TickspotClient[]> {
        return this.request<TickspotClient[]>('GET', 'clients.json');
    }

    getClient(clientId: string | number) : Promise<TickspotClient> {
        return this.request<TickspotClient>('GET', `clients/${clientId}.json`);
    }

    getProjects(): Promise<TickspotProject[]> {
        return this.request<TickspotProject[]>('GET', 'projects.json');
    }

    getProject(projectId: string | number) : Promise<TickspotProject> {
        return this.request<TickspotProject>('GET', `projects/${projectId}.json`);
    }

    getProjectTasks(projectId: string | number) : Promise<TickspotTask[]> {
        return this.request<TickspotTask[]>('GET', `projects/${projectId}/tasks.json`)
    }

    async roles(username: string, password: string): Promise<TickspotRole[]> {
        return Axios.request<TickspotRole[]>({
            method: 'GET',
            url: `${this.API_DOMAIN}${this.API_PATH}roles.json`,
            headers: {
                'User-Agent': `${this.USER_AGENT} <${username}>`
            },
            auth: {
                username,
                password
            }
        }).then(r => r.data);
    }
}