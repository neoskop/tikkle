import * as Colors from 'colors/safe';
import { Argv } from 'yargs';

import { TickspotApi } from '../apis/tickspot.api';
import { TogglApi } from '../apis/toggl.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';
import { Cache } from '../cache';

export class Setup implements ICommand {
    readonly command = 'setup';
    readonly description = 'Setup tikkle';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv): Argv {
        return args;
    }

    async run(_args: {}, config: IConfiguration) {
        Cache.create().clear();
        const tickspot = new TickspotApi(config.tickspot.role, config.tickspot.username);
        const toggl = new TogglApi(config.toggl.token, config.toggl.workspace);

        const clientMapping = new Map(config.mapping && config.mapping.clients);
        const projectMapping = new Map(config.mapping && config.mapping.projects);

        const tickspotClients = new Map((await Promise.all(config.tickspot.clients.map(([id]) => tickspot.getClient(id)))).map(client => [client.id.toString(), client]));
        const togglClients = await toggl.getClients();
        const tickspotProjects = new Map((await tickspot.getProjects()).map(project => [project.id.toString(), project]));

        for (const [clientId, projectIds] of config.tickspot.clients) {
            const client = tickspotClients.get(clientId)!;
            const projects = projectIds.map(id => tickspotProjects.get(id)!);

            let togglClient = config.mapping ? togglClients.find(c => c.id === clientMapping.get(client.id)) : togglClients.find(c => c.name === client.name);
            if (!togglClient) {
                console.log(Colors.green('✓'), Colors.bold('Client Project'), client.name)
                togglClient = await toggl.createClient({ name: client.name, notes: '@Tikkle' });
                clientMapping.set(client.id, togglClient.id);
            } else if(client.name !== togglClient.name) {
                console.log(Colors.green('↺'), Colors.bold('Client Project'), client.name)
                togglClient.name = client.name;
                togglClient = await toggl.updateClient(togglClient.id!, togglClient);
            } else {
                if(!config.mapping) {
                    clientMapping.set(client.id, togglClient.id);
                }
                console.log(Colors.yellow('↷'), Colors.bold('Client Project'), client.name)
            }

            for (const project of projects) {               
                const tickspotTasks = await tickspot.getProjectTasks(project.id);
                const togglProjects = (await toggl.getClientProjects(togglClient.id)) || [];

                for (const tickspotTask of tickspotTasks) {
                    const togglProjectName = `${project.name} // ${tickspotTask.name}`;
                    let togglProject = config.mapping ? togglProjects.find(p => p.id === projectMapping.get(tickspotTask.id)) : togglProjects.find(p => p.name === togglProjectName && p.cid === togglClient!.id);
                    const active = !client.archive && !project.date_closed && !tickspotTask.date_closed;
                    if (!togglProject) {
                        console.log(' ', Colors.green('✓'), togglProjectName);
                        togglProject = await toggl.createProject({ name: togglProjectName, cid: togglClient.id });
                        projectMapping.set(tickspotTask.id, togglProject.id);
                    } else if(togglProject.name !== togglProjectName || togglProject.active !== active) {
                        console.log(' ', Colors.green('↺'), togglProjectName)
                        togglProject.name = togglProjectName;
                        togglProject.active = !client.archive && active
                        togglProject = await toggl.updateProject(togglProject.id, togglProject);
                    } else {
                        if(!config.mapping) {
                            projectMapping.set(tickspotTask.id, togglProject.id);
                        }
                        console.log(' ', Colors.yellow('↷'), togglProjectName)
                    }
                }
            }
        }
        config.mapping = {
            clients: [ ...clientMapping.entries() ],
            projects: [ ...projectMapping.entries() ]
        }
        await this.config.write(config);
        Cache.create().clear();
    }
}