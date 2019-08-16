import { Argv, Arguments } from 'yargs';
import * as Colors from 'colors/safe';

import { TickspotApi, TickspotClient, TickspotProject, TickspotTask } from '../apis/tickspot.api';
import { TogglApi, TogglProject, TogglTimeEntry, TogglClient } from '../apis/toggl.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';

interface MappedTimeEntry {
    entry: TogglTimeEntry;
    togglClient: TogglClient;
    togglProject: TogglProject;
    tickspotClient: TickspotClient;
    tickspotProject: TickspotProject;
    tickspotTask: TickspotTask
}

const DATE_REGEXP = /^\d{4}-\d{2}-\d{2}$/;
const DATE_RANGE_REGEXP = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/;


export class Sync implements ICommand<{ range: string }> {
    readonly command = 'sync [range]';
    readonly description = 'Sync all Tikkle entries in Toggl';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv): Argv<{ range: string }> {
        return (args.positional('range', {
            description: 'A date(YYYY-MM-DD), a date range(YYYY-MM-DD..YYYY-MM-DD), "today" or "yesterday"',
            required: true,
            default: 'today',
            type: 'string'
        }) as Argv<{ range: string }>).check(args => {
            if (!(args.range === 'today'
                || args.range === 'yesterday'
                || DATE_REGEXP.test(args.range)
                || DATE_RANGE_REGEXP.test(args.range))) {
                throw new Error('Invalid date range')
            }
            return true
        });
    }

    async run({ range }: Arguments<{ range: string }>, config: IConfiguration) {
        let start: Date;
        let end: Date;
        if (range.toLowerCase() === 'today') {
            start = new Date();
            end = new Date();
        } else if (range.toLowerCase() === 'yesterday') {
            start = new Date();
            end = new Date();
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (DATE_REGEXP.test(range)) {
            start = new Date(range);
            end = new Date(range);
        } else if (DATE_RANGE_REGEXP.test(range)) {
            const [s, e] = range.split(/\.\./);
            start = new Date(s);
            end = new Date(e);
        } else {
            return;
        }

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error(`Invalid date "${range}"`)
        }

        setStart(start);
        setEnd(end);

        const tickspot = new TickspotApi(config.tickspot.role, config.tickspot.username);
        const toggl = new TogglApi(config.toggl.token, config.toggl.workspace);

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

        const togglClients = (await toggl.getClients()).filter(client => tickspotClientsByName.has(client.name));
        const togglClientsById = new Map(togglClients.map(client => [client.id, client]));

        const togglProjects: TogglProject[] = [];

        for (const client of togglClients) {
            togglProjects.push(...((await toggl.getClientProjects(client.id)) || []).filter(project => {
                const [name] = project.name.split(/ \/\/ /);
                return tickspotProjectsByName.has(name);
            }));
        }

        const togglProjectsById = new Map(togglProjects.map(project => [project.id, project]));

        const existingTimeEntries = await tickspot.getTimeEntries({ start, end });

        const timeEntries = (await toggl.getTimeEntries({ start, end })).map(entry => {
            if (!entry.pid) {
                return false;
            }

            const togglProject = togglProjectsById.get(entry.pid);
            if (!togglProject) return false;
            const togglClient = togglClientsById.get(togglProject.cid);
            if (!togglClient) return false;

            const [projectName, taskName] = togglProject.name.split(/ \/\/ /);

            const tickspotClient = tickspotClientsByName.get(togglClient.name);
            const tickspotProject = tickspotProjectsByName.get(projectName);
            const tickspotTask = tickspotTasksByName.get(taskName);
            if (!tickspotClient || !tickspotProject || !tickspotTask) return;

            return {
                entry,
                togglClient,
                togglProject,
                tickspotClient,
                tickspotProject,
                tickspotTask
            }
        }).filter((entry): entry is MappedTimeEntry => false !== entry);

        const map = timeEntries.reduce((m, c) => {
            if (!c.entry.stop) return m;
            const key = config.settings.grouping ? c.entry.pid!.toString() : `${c.entry.pid}-${c.entry.description}`;
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

            const notes = ['@Tikkle'];

            if (config.settings.grouping) {
                notes.push(...entry.map(({ entry }) => entry.description).filter(Boolean).filter((c, i, a) => a.indexOf(c) === i))
            } else if (entry[0].entry.description) {
                notes.push(entry[0].entry.description);
            }

            const tickspotEntry = {
                date: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
                hours: duration / 3600,
                task_id: entry[0].tickspotTask.id,
                notes: notes.join('\n')
            }

            const existingTimeEntry = existingTimeEntries.find(e => e.task_id === tickspotEntry.task_id && e.notes.replace(/\r\n/g, '\n') === tickspotEntry.notes);

            if (!existingTimeEntry) {
                await tickspot.createEntry(tickspotEntry);
                console.log(
                    Colors.green('✓'),
                    Colors.bold(entry[0].tickspotClient.name),
                    '>',
                    Colors.bold(entry[0].tickspotProject.name),
                    '>',
                    Colors.bold(entry[0].tickspotTask.name),
                    Colors.gray(`added '${Colors.white(notes.slice(1).join(', '))}' with ${Colors.cyan(tickspotEntry.hours.toFixed(2))} hours at ${Colors.cyan(tickspotEntry.date)}`)
                )
            } else if (existingTimeEntry.hours !== tickspotEntry.hours) {
                await tickspot.updateEntry(existingTimeEntry.id, tickspotEntry);
                console.log(
                    Colors.green('↺'),
                    Colors.bold(entry[0].tickspotClient.name),
                    '>',
                    Colors.bold(entry[0].tickspotProject.name),
                    '>',
                    Colors.bold(entry[0].tickspotTask.name),
                    Colors.gray(`updated '${Colors.white(notes.slice(1).join(', '))}' with ${Colors.cyan(tickspotEntry.hours.toFixed(2))} hours at ${Colors.cyan(tickspotEntry.date)}`)
                )
            } else {
                console.log(
                    Colors.yellow('↷'),
                    Colors.bold(entry[0].tickspotClient.name),
                    '>',
                    Colors.bold(entry[0].tickspotProject.name),
                    '>',
                    Colors.bold(entry[0].tickspotTask.name),
                    Colors.gray(`no changes in '${Colors.white(notes.slice(1).join(', '))}' with ${Colors.cyan(tickspotEntry.hours.toFixed(2))} hours at ${Colors.cyan(tickspotEntry.date)}`)
                )
            }
        }
    }
}

function setStart(date: Date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
}
function setEnd(date: Date) {
    date.setHours(23);
    date.setMinutes(59);
    date.setSeconds(59);
    date.setMilliseconds(999);
}