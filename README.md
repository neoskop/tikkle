# @neoskop/tikkle

The missing link between tickspot and toggl

## Usage

`tikkle init` Enter/update credentials and client/project selection.  
`tikkle setup` Create the clients/projects in Toggl.  
`tikkle purge` Remove created clients and projects from Toggl.  
`tikkle sync [range]` Sync the given time range from Toggl to Tickspot.  
`tikkle cache clear` Clear the local tikkle cache.

### Time Range

A valid time range is either `today` or `yesterday`, a single date in the format `YYYY-MM-DD` or date range in the format `YYYY-MM-DD..YYYY-MM-DD`.

## Testing

Run tests with `yarn test`. See [package.json](./package.json) for additional test scripts.

## Versioning

This package follows [SemVer](https://semver.org/) and uses [@neoskop/flow-bump](https://github.com/neoskop/flow-bump) for versioning.

## License

This project is licensed under the MIT License - see the [LICENSE.md](./LICENSE.md) file for details