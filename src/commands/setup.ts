import * as Colors from 'colors/safe';
import { Argv } from 'yargs';

import { TickspotApi } from '../apis/tickspot.api';
import { TogglApi } from '../apis/toggl.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';
import { Cache } from '../cache';

export class Setup implements ICommand<{ verbose: boolean }> {
    readonly command = 'setup';
    readonly description = 'Setup tikkle';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv): Argv<{ verbose: boolean }> {
        return args.option('verbose', {
            alias: 'v',
            type: 'boolean',
            description: 'More verbose output',
            default: false
        });
    }

    async run({ verbose }: { verbose: boolean }, config: IConfiguration) {
        Cache.create().clear();
        const tickspot = new TickspotApi(config.tickspot.role, config.tickspot.username);
        const toggl = new TogglApi(config.toggl.token, config.toggl.workspace);

        const clientMapping = new Map(config.mapping && config.mapping.clients);
        const taskMapping = new Map(config.mapping && config.mapping.tasks);
        const projectMapping = config.mapping && config.mapping.projects || [];

        const tickspotClients = new Map((await Promise.all(config.tickspot.clients.map(([id]) => tickspot.getClient(id)))).map(client => [client.id.toString(), client]));
        const togglClients = await toggl.getClients();
        const tickspotProjects = new Map((await tickspot.getProjects()).map(project => [project.id.toString(), project]));

        for (const [clientId, projectIds] of config.tickspot.clients) {
            const client = tickspotClients.get(clientId)!;
            const projects = projectIds.map(id => tickspotProjects.get(id)!).filter(Boolean);

            let togglClient = config.mapping ? togglClients.find(c => c.id === clientMapping.get(client.id)) : togglClients.find(c => c.name === client.name);
            if (!togglClient) {
                togglClient = await toggl.createClient({ name: client.name, notes: '@Tikkle' });
                console.log(Colors.green('✓'), Colors.bold('Client Project'), client.name, verbose ? Colors.gray(`(Tickspot: ${client.id}, Toggl: ${togglClient.id})`) : '')
                clientMapping.set(client.id, togglClient.id);
            } else if(client.name !== togglClient.name) {
                console.log(Colors.green('↺'), Colors.bold('Client Project'), client.name, verbose ? Colors.gray(`(Tickspot: ${client.id}, Toggl: ${togglClient.id})`) : '')
                togglClient.name = client.name;
                togglClient = await toggl.updateClient(togglClient.id!, togglClient);
            } else {
                if(!config.mapping) {
                    clientMapping.set(client.id, togglClient.id);
                }
                console.log(Colors.yellow('↷'), Colors.bold('Client Project'), client.name, verbose ? Colors.gray(`(Tickspot: ${client.id}, Toggl: ${togglClient.id})`) : '')
            }

            for (const project of projects) {               
                const tickspotTasks = await tickspot.getProjectTasks(project.id);
                const togglProjects = (await toggl.getClientProjects(togglClient.id)) || [];

                for (const tickspotTask of tickspotTasks) {
                    const togglProjectName = `${project.name} // ${tickspotTask.name}`;
                    let togglProject = config.mapping ? togglProjects.find(p => p.id === taskMapping.get(tickspotTask.id)) : togglProjects.find(p => p.name === togglProjectName && p.cid === togglClient!.id);
                    const active = !client.archive && !project.date_closed && !tickspotTask.date_closed;
                    if (!togglProject) {
                        togglProject = await toggl.createProject({ name: togglProjectName, cid: togglClient.id });
                        console.log(' ', Colors.green('✓'), togglProjectName, verbose ? Colors.gray(`(Tickspot: ${tickspotTask.id}, Toggl: ${togglProject.id})`) : '');
                        projectMapping.push([ tickspotTask.project_id, togglProject.id ]);
                        taskMapping.set(tickspotTask.id, togglProject.id);
                    } else if(togglProject.name !== togglProjectName || togglProject.active !== active) {
                        console.log(' ', Colors.green('↺'), togglProjectName, verbose ? Colors.gray(`(Tickspot: ${tickspotTask.id}, Toggl: ${togglProject.id})`) : '')
                        togglProject.name = togglProjectName;
                        togglProject.active = !client.archive && active
                        togglProject = await toggl.updateProject(togglProject.id, togglProject);
                    } else {
                        if(!config.mapping) {
                            projectMapping.push([ tickspotTask.project_id, togglProject.id ]);
                            taskMapping.set(tickspotTask.id, togglProject.id);
                        }
                        console.log(' ', Colors.yellow('↷'), togglProjectName, verbose ? Colors.gray(`(Tickspot: ${tickspotTask.id}, Toggl: ${togglProject.id})`) : '')
                    }
                }
            }
        }
        config.mapping = {
            clients: [ ...clientMapping.entries() ],
            tasks: [ ...taskMapping.entries() ],
            projects: projectMapping
        }
        await this.config.write(config);
        Cache.create().clear();
    }
}