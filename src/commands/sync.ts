import Colors from 'colors/safe';
import { Arguments, Argv } from 'yargs';

import { TickspotApi, TickspotClient, TickspotProject, TickspotTask } from '../apis/tickspot.api';
import { TogglApi, TogglClient, TogglProject, TogglTimeEntry } from '../apis/toggl.api';
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
            description: 'A date(YYYY-MM-DD), a date range(YYYY-MM-DD..YYYY-MM-DD), "today", "yesterday", "week" or "month"',
            required: true,
            default: 'today',
            type: 'string'
        }) as Argv<{ range: string }>).check(args => {
            if (!(args.range === 'today'
                || args.range === 'yesterday'
                || args.range === 'week'
                || args.range === 'month'
                || DATE_REGEXP.test(args.range)
                || DATE_RANGE_REGEXP.test(args.range))) {
                throw new Error('Invalid date range')
            }
            return true
        });
    }

    async run({ range }: Arguments<{ range: string }>, config: IConfiguration) {
        if(!config.mapping || !config.mapping.clients || !config.mapping.projects || !config.mapping.tasks) {
            throw new Error('Mapping missing. Run `tikkle setup` to generate the mapping.');
        }

        let start: Date;
        let end: Date;
        if (range === 'today') {
            start = new Date();
            end = new Date();
        } else if (range === 'yesterday') {
            start = new Date();
            end = new Date();
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if(range === 'week') {
            start = new Date();
            start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
            end = new Date(start);
            end.setDate(end.getDate() + 6);
        } else if(range === 'month') {
            start = new Date();
            end = new Date();
            start.setDate(1);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
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

        const reverseClientMapping = new Map(config.mapping.clients.map(([ a, b ]) => [ b, a ]));
        const reverseProjectMapping = new Map(config.mapping.projects.map(([ a, b ]) => [ b, a ]));
        const reverseTaskMapping = new Map(config.mapping.tasks.map(([ a, b ]) => [ b, a ]));

        const tickspotClientsById = new Map(tickspotClients.map(client => [client.id, client]));
        const tickspotProjectsById = new Map(tickspotProjects.map(project => [project.id, project]));
        const tickspotTasksById = new Map(tickspotTasks.map(task => [task.id, task]));

        const togglClients = (await toggl.getClients()).filter(client => reverseClientMapping.has(client.id));
        const togglClientsById = new Map(togglClients.map(client => [client.id, client]));

        const togglProjects: TogglProject[] = [];

        for (const client of togglClients) {
            togglProjects.push(...((await toggl.getClientProjects(client.id)) || []).filter(project => {
                return reverseProjectMapping.has(project.id);
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

            const tickspotClient = tickspotClientsById.get(reverseClientMapping.get(togglClient.id)!);
            const tickspotProject = tickspotProjectsById.get(reverseProjectMapping.get(togglProject.id)!);
            const tickspotTask = tickspotTasksById.get(reverseTaskMapping.get(togglProject.id)!);
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
            const date = new Date(c.entry.stop);
            const dateStr = formatDate(date);
            const key = config.settings.grouping ? `${c.entry.pid}-${dateStr}` : `${c.entry.pid}-${dateStr}-${c.entry.description}`;
            if (m.has(key)) {
                m.get(key)!.push(c);
            } else {
                m.set(key, [c])
            }
            return m;
        }, new Map<string, [MappedTimeEntry]>());

        const RAW_ENTRY = Symbol('RAW_ENTRY');

        const tickspotEntries = [ ...map.values() ].map(entry => {
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

            return {
                [RAW_ENTRY]: entry,
                date: formatDate(date),
                hours: duration / 3600,
                task_id: entry[0].tickspotTask.id,
                notes: notes.join('\n')
            }
        }).sort((a, b) => {
            if(a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
            if(a[RAW_ENTRY][0].tickspotClient.name !== b[RAW_ENTRY][0].tickspotClient.name) {
                return a[RAW_ENTRY][0].tickspotClient.name.localeCompare(b[RAW_ENTRY][0].tickspotClient.name)
            }
            if(a[RAW_ENTRY][0].tickspotProject.name !== b[RAW_ENTRY][0].tickspotProject.name) {
                return a[RAW_ENTRY][0].tickspotProject.name.localeCompare(b[RAW_ENTRY][0].tickspotProject.name)
            }
            if(a[RAW_ENTRY][0].tickspotTask.name !== b[RAW_ENTRY][0].tickspotTask.name) {
                return a[RAW_ENTRY][0].tickspotTask.name.localeCompare(b[RAW_ENTRY][0].tickspotTask.name)
            }

            return a[RAW_ENTRY][0].entry.stop.localeCompare(b[RAW_ENTRY][0].entry.stop);
        });

        const maxClientLength = tickspotEntries.reduce((max, { [RAW_ENTRY]: entry }) => Math.max(max, entry[0].tickspotClient.name.length), 0);
        const maxProjectLength = tickspotEntries.reduce((max, { [RAW_ENTRY]: entry }) => Math.max(max, entry[0].tickspotProject.name.length), 0);
        const maxTaskLength = tickspotEntries.reduce((max, { [RAW_ENTRY]: entry }) => Math.max(max, entry[0].tickspotTask.name.length), 0);

        let latestDate: string|undefined;
        let latestClient: string|undefined;
        let latestProject: string|undefined;
        let latestTask: string|undefined;

        let sumHours = 0;
        let sumHoursPerDay = 0;

        if(tickspotEntries.length) {
            console.log();
            if(formatDate(start) === formatDate(end)) {
                console.log('', Colors.bold(`Sync:`), formatDate(start));
            } else {
                console.log('', Colors.bold(`Sync:`), formatDate(start), '-', formatDate(end));
            }
            console.log();
            console.log('', Colors.yellow('↷'), 'No changes', Colors.green('✓'), 'Added', Colors.green('↺'), 'Updated');
            console.log();
            console.log(
                Colors.bold(Colors.bgWhite(Colors.black('Date'.padEnd(10)))),
                Colors.bold(Colors.bgWhite(Colors.black('Client'.padEnd(maxClientLength)))),
                Colors.bold(Colors.bgWhite(Colors.black('Project'.padEnd(maxProjectLength)))),
                Colors.bold(Colors.bgWhite(Colors.black('Task'.padEnd(maxTaskLength)))),
                Colors.bold(Colors.bgWhite(Colors.black('Hours'))),
                Colors.bold(Colors.bgWhite(Colors.black('Description'.padEnd(30))))
            )
        }

        for(const entry of tickspotEntries) {
            const date = entry.date === latestDate ? '' : entry.date;
            const clientName = !date && entry[RAW_ENTRY][0].tickspotClient.name === latestClient ? '' : entry[RAW_ENTRY][0].tickspotClient.name; 
            const projectName = !clientName && entry[RAW_ENTRY][0].tickspotProject.name === latestProject ? '' : entry[RAW_ENTRY][0].tickspotProject.name; 
            const taskName = !projectName && entry[RAW_ENTRY][0].tickspotTask.name === latestTask ? '' : entry[RAW_ENTRY][0].tickspotTask.name;

            if(date && latestDate != null) {
                process.stdout.write(Colors.bold(`${latestDate} Total `.padStart(10 + maxClientLength + maxProjectLength + maxTaskLength + 4)));
                process.stdout.write(Colors.bold(`${Colors.cyan(sumHoursPerDay.toFixed(2).padStart(5))}\n`));
                console.log();
                sumHoursPerDay = 0;
            }

            const existingTimeEntry = existingTimeEntries.find(e => e.date.substr(0, 10) === entry.date.substr(0, 10) && e.task_id === entry.task_id && e.notes.replace(/\r\n/g, '\n') === entry.notes);

            let mode : 'add' | 'update' | 'skip' = 'skip';

            if(!existingTimeEntry) {
                mode = 'add';
            } else if(existingTimeEntry.hours !== entry.hours) {
                mode = 'update';
            }

            process.stdout.write([
                date.padEnd(10), 
                clientName.padEnd(maxClientLength), 
                projectName.padEnd(maxProjectLength),
                taskName.padEnd(maxTaskLength),
                `${Colors.cyan(entry.hours.toFixed(2).padStart(5))}`,
                Colors.white(entry.notes.split(/\n/).slice(1).join(', ')),
                mode !== 'skip' ? Colors.gray('⚙') : Colors.yellow('↷'),
                mode !== 'skip' ? '\r' : '\n'
            ].join(' '))

            switch(mode) {
                case 'add':
                    await tickspot.createEntry(entry);
                    break;
                case 'update':
                    await tickspot.updateEntry(existingTimeEntry!.id!, entry);
            }

            sumHours += entry.hours;
            sumHoursPerDay += entry.hours;

            if(mode !== 'skip') {
                process.stdout.write([
                    date.padEnd(10), 
                    clientName.padEnd(maxClientLength), 
                    projectName.padEnd(maxProjectLength),
                    taskName.padEnd(maxTaskLength),
                    `${Colors.cyan(entry.hours.toFixed(2).padStart(5))}`,
                    Colors.white(entry.notes.split(/\n/).slice(1).join(', ')),
                    mode !== 'add' ? Colors.green('✓') : Colors.green('↺'),
                    '\n'
                ].join(' '))
            }

            latestDate = entry.date;
            latestClient = entry[RAW_ENTRY][0].tickspotClient.name; 
            latestProject = entry[RAW_ENTRY][0].tickspotProject.name; 
            latestTask = entry[RAW_ENTRY][0].tickspotTask.name;
        }

        if(latestDate) {
            process.stdout.write(Colors.bold(`${latestDate} Total `.padStart(10 + maxClientLength + maxProjectLength + maxTaskLength + 4)));
            process.stdout.write(Colors.bold(`${Colors.cyan(sumHoursPerDay.toFixed(2).padStart(5))}\n`));
        }

        console.log();
        process.stdout.write(Colors.bold('Total '.padStart(10 + maxClientLength + maxProjectLength + maxTaskLength + 4)));
        process.stdout.write(Colors.bold(`${Colors.cyan(sumHours.toFixed(2).padStart(5))}\n`));
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

function formatDate(date: Date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}