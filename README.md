# @neoskop/tikkle

The missing link between tickspot and toggl

## Usage

`tikkle init` Enter/update credentials and client/project selection.  
`tikkle setup` Create the clients/projects in Toggl.  
`tikkle configure` Configure tikkle.  
`tikkle sync [range]` Sync the given time range from Toggl to Tickspot.  
`tikkle purge` Remove created clients and projects from Toggl.  
`tikkle cache clear` Clear the local tikkle cache.

### Configure

#### Round To

`Default: 900`  

Round the tracked durations to N seconds. For example: `900` means to round to a quarter hour.

#### Round Up By

`Default: 0.33`  

Defines when to round up.  For example: `0.33` means to round up after 5 minutes, when `Round To` is set to `900` (1/3 of a quarter hour), 
so 19 minutes will be logged as 0.25 hours but 20 minutes will bel logged as 0.50 hours.

#### Grouping

`Default: false`

Group the logged entries by tickspot task if enabled. The description will be summarized.

### Time Range

A valid time range is either `today` or `yesterday`, a single date in the format `YYYY-MM-DD` or date range in the format `YYYY-MM-DD..YYYY-MM-DD`.

## Testing

Run tests with `yarn test`. See [package.json](./package.json) for additional test scripts.

## Versioning

This package follows [SemVer](https://semver.org/) and uses [@neoskop/flow-bump](https://github.com/neoskop/flow-bump) for versioning.

## License

This project is licensed under the MIT License - see the [LICENSE.md](./LICENSE.md) file for details