#!/usr/bin/env node
import { Command } from "commander";
import syncCommand from "./commands/sync.js";
import initCommand from "./commands/init.js";

const program = new Command();

program
  .name("velog-sync")
  .description("Sync velog posts to your GitHub Pages repo")
  .version("0.1.0");

program.addCommand(syncCommand);
program.addCommand(initCommand);

program.parse(process.argv);
