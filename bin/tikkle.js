#!/usr/bin/env node

require("../dist").main().catch(err => {
    console.error(err);
    process.exit(1);
});