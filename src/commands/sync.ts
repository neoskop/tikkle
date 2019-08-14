import { Argv, Arguments } from 'yargs';
import * as Colors from 'colors/safe';

import { TickspotApi, TickspotClient, TickspotProject, TickspotTask } from '../apis/tickspot.api';
import { ToggleApi, ToggleProject, ToggleTimeEntry, ToggleClient } from '../apis/toggle.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';

interface MappedTimeEntry {
    entry: ToggleTimeEntry;
    toggleClient: ToggleClient;
    toggleProject: ToggleProject;
    tickspotClient: TickspotClient;
    tickspotProject: TickspotProject;
    tickspotTask: TickspotTask
}

export class Sync implements ICommand<{ range: string }> {
    readonly command = 'sync <range>';
    readonly description = 'Sync all Tikkle entries in Toggle';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv<{ range: string }>): Argv {
        return args.positional('range', {
            description: 'A date(YYYY-MM-DD), a date range(YYYY-MM-DD..YYYY-MM-DD), "today" or "yesterday"'
        });
    }

    async run({ range } : Arguments<{ range: string }>, config: IConfiguration) {
        let start : Date;
        let end : Date;
        if(range.toLowerCase() === 'today') {
            start = new Date();
            end = new Date();
        } else if(range.toLowerCase() === 'yesterday') {
            start = new Date();
            end = new Date();
            start.setDate(start.getDate() - 1);
        } else if(/^\d{4}-\d{2}-\d{2}$/.test(range)) {
            start = new Date(range);
            end = new Date(range);
        } else if(/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(range)) {
            const [ s, e ] = range.split(/\.\./);
            start = new Date(s);
            end = new Date(e);
        } else {
            throw new Error(`Unknown date range "${range}"`);
        }

        if(isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error(`Invalid date "${range}"`)
        }

        setMidnight(start);
        setMidnight(end);
        end.setDate(end.getDate() + 1);

        const tickspot = new TickspotApi(config.tickspot.role, config.tickspot.username);
        const toggle = new ToggleApi(config.toggle.token, config.toggle.workspace);

        const tickspotClients: TickspotClient[] = [];
        const tickspotProjects: TickspotProject[] = [];
        const tickspotTasks: TickspotTask[] = [];

        for (const [clientId, projectIds] of config.tickspot.clients) {
            tickspotClients.push(await tickspot.getClient(clientId));
            tickspotProjects.push(...await Promise.all(projectIds.map(id => tickspot.getProject(id))));
        }

        for (const project of tickspotProjects) {
            tickspotTasks.push(...await tickspot.getProjectTasks(project.id));
        }

        const tickspotClientsByName = new Map(tickspotClients.map(client => [client.name, client]));
        const tickspotProjectsByName = new Map(tickspotProjects.map(project => [project.name, project]));
        const tickspotTasksByName = new Map(tickspotTasks.map(task => [task.name, task]));

        const toggleClients = (await toggle.getClients()).filter(client => tickspotClientsByName.has(client.name));
        const toggleClientsById = new Map(toggleClients.map(client => [client.id, client]));

        const toggleProjects: ToggleProject[] = [];

        for (const client of toggleClients) {
            toggleProjects.push(...((await toggle.getClientProjects(client.id)) || []).filter(project => {
                const [name] = project.name.split(/ \/\/ /);
                return tickspotProjectsByName.has(name);
            }));
        }

        const toggleProjectsById = new Map(toggleProjects.map(project => [project.id, project]));

        const existingTimeEntries = await tickspot.getTimeEntries({ start, end });

        const timeEntries = (await toggle.getTimeEntries({ start, end })).map(entry => {
            if (!entry.pid) {
                return false;
            }

            const toggleProject = toggleProjectsById.get(entry.pid);
            if (!toggleProject) return false;
            const toggleClient = toggleClientsById.get(toggleProject.cid);
            if (!toggleClient) return false;

            const [projectName, taskName] = toggleProject.name.split(/ \/\/ /);

            const tickspotClient = tickspotClientsByName.get(toggleClient.name);
            const tickspotProject = tickspotProjectsByName.get(projectName);
            const tickspotTask = tickspotTasksByName.get(taskName);
            if (!tickspotClient || !tickspotProject || !tickspotTask) return;

            return {
                entry,
                toggleClient,
                toggleProject,
                tickspotClient,
                tickspotProject,
                tickspotTask
            }
        }).filter((entry): entry is MappedTimeEntry => false !== entry);

        const map = timeEntries.reduce((m, c) => {
            const key = `${c.entry.pid}-${c.entry.description}`;
            if (m.has(key)) {
                m.get(key)!.push(c);
            } else {
                m.set(key, [c])
            }
            return m;
        }, new Map<string, [MappedTimeEntry]>());

        for (const entry of map.values()) {
            let duration = entry.reduce((t, c) => t + c.entry.duration, 0);

            const mod = duration % config.settings.rounding;


            if (mod >= config.settings.rounding * config.settings.roundUpBy) {
                duration += config.settings.rounding - mod;
            } else {
                duration -= mod;
            }

            const date = new Date(entry[0].entry.stop);
            
            const tickspotEntry = {
                date: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
                hours: duration / 3600,
                task_id: entry[0].tickspotTask.id,
                notes: `@Tikkle\n${entry[0].entry.description}`
            }

            const existingTimeEntry = existingTimeEntries.find(e => e.task_id === tickspotEntry.task_id && e.notes.replace(/\r\n/g, '\n') === tickspotEntry.notes);

            if(!existingTimeEntry) {
                await tickspot.createEntry(tickspotEntry);
                console.log(
                    Colors.green('✓'),
                    Colors.bold(entry[0].tickspotClient.name),
                    '>',
                    Colors.bold(entry[0].tickspotProject.name),
                    '>',
                    Colors.bold(entry[0].tickspotTask.name),
                    Colors.gray(`added '${Colors.white(entry[0].entry.description)}' with ${Colors.cyan(tickspotEntry.hours.toFixed(2))} hours at ${Colors.cyan(tickspotEntry.date)}`)
                )
            } else if(existingTimeEntry.hours !== tickspotEntry.hours) {
                await tickspot.updateEntry(existingTimeEntry.id, tickspotEntry);
                console.log(
                    Colors.green('↺'),
                    Colors.bold(entry[0].tickspotClient.name),
                    '>',
                    Colors.bold(entry[0].tickspotProject.name),
                    '>',
                    Colors.bold(entry[0].tickspotTask.name),
                    Colors.gray(`updated '${Colors.white(entry[0].entry.description)}' with ${Colors.cyan(tickspotEntry.hours.toFixed(2))} hours at ${Colors.cyan(tickspotEntry.date)}`)
                )
            } else {
                console.log(
                    Colors.yellow('↷'),
                    Colors.bold(entry[0].tickspotClient.name),
                    '>',
                    Colors.bold(entry[0].tickspotProject.name),
                    '>',
                    Colors.bold(entry[0].tickspotTask.name),
                    Colors.gray(`no changes in '${Colors.white(entry[0].entry.description)}' with ${Colors.cyan(tickspotEntry.hours.toFixed(2))} hours at ${Colors.cyan(tickspotEntry.date)}`)
                )
            }
        }
    }
}

function setMidnight(date : Date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
}