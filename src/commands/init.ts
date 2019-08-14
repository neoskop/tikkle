import * as prompts from 'prompts';
import { Argv } from 'yargs';

import { TickspotApi, TickspotRole } from '../apis/tickspot.api';
import { ToggleApi } from '../apis/toggle.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';

export class Init implements ICommand {
    readonly command = 'init';
    readonly description = 'Init tikkle';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv<{}>): Argv {
        return args;
    }

    protected async getRoleByPassword(username: string, config?: IConfiguration) {
        const { password } = await prompts({
            name: 'password',
            message: 'Tickspot Password',
            type: 'invisible'
        });

        const api = new TickspotApi();
        const roles = await api.roles(username, password);

        if (roles.length > 1) {
            const { roleToken } = await prompts({
                name: 'roleToken',
                message: 'Select role',
                type: 'select',
                choices: roles.map(role => ({ title: role.company, value: role.api_token })),
                initial: config && config.tickspot.role.api_token
            });

            return roles.find(r => r.api_token === roleToken)!;
        } else {
            return roles[0];
        }
    }

    protected async getRoleByToken(config?: IConfiguration): Promise<TickspotRole> {
        const { api_token, subscription_id } = await prompts([
            {
                name: 'api_token',
                message: 'Tickspot API Token',
                type: 'text',
                initial: config && config.tickspot.role.api_token
            },
            {
                name: 'subscription_id',
                message: 'Tickspot Subscription ID',
                type: 'number',
                initial: config && config.tickspot.role.subscription_id
            }
        ]);

        return {
            api_token,
            subscription_id,
            company: config && config.tickspot.role.company || '<CUSTOM>'
        }
    }

    protected async getToggleWorkspace(token: string): Promise<number> {
        const workspaces = await new ToggleApi(token).getWorkspaces();

        if (workspaces.length === 1) {
            return workspaces[0].id;
        }

        const { workspace } = await prompts({
            name: 'workspace',
            message: 'Toggle Workspace',
            type: 'select',
            choices: workspaces.map(ws => ({ title: ws.name, value: ws.id.toString() }))
        });

        return +workspace;
    }

    async run(_args: {}, config?: IConfiguration) {
        const { username } = await prompts({
            name: 'username',
            message: 'Tickspot E-Mail',
            type: 'text',
            initial: config && config.tickspot.username
        });

        if (!username) {
            throw new Error('SKIP INPUT');
        }

        const { method } = await prompts({
            name: 'method',
            message: 'Tickspot Auth Method',
            type: "select",
            choices: [
                { title: 'Password', value: 'password' },
                { title: 'API Token', value: 'token' }
            ]
        });

        if (!method) {
            throw new Error('SKIP INPUT');
        }

        let role: TickspotRole = method === 'password' ? await this.getRoleByPassword(username, config) : await this.getRoleByToken(config);


        const { token } = await prompts({
            name: 'token',
            message: 'Toggle API Token',
            type: 'text',
            initial: config && config.toggle.token
        });

        if (!token) {
            throw new Error('SKIP INPUT');
        }

        const workspace = await this.getToggleWorkspace(token);

        const availableClients = await new TickspotApi(role, username).getClients();
        const availableProjects = await new TickspotApi(role, username).getProjects();

        const { clients: selectedClients } = await prompts({
            name: 'clients',
            message: 'Clients',
            type: 'multiselect',
            choices: availableClients.filter(client => !client.archive).map(client => ({ title: client.name, value: client.id.toString() })),
        });

        const clients: [string, string[]][] = [];

        for (const clientId of selectedClients) {
            const client = availableClients.find(c => c.id.toString() === clientId)!;
            const { projects } = await prompts({
                name: 'projects',
                message: `${client.name}-Projects`,
                type: 'multiselect',
                choices: availableProjects.filter(project => project.date_closed === null && project.client_id === client.id).map(project => ({ title: project.name, value: project.id.toString() }))
            });

            clients.push([clientId, projects]);
        }

        config = {
            tickspot: {
                role,
                clients,
                username
            },
            toggle: {
                token,
                workspace
            },
            settings: {
                rounding: 900,
                roundUpBy: .333
            }
        }

        await this.config.write(config);
        return config;
    }
}