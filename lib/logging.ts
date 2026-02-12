import chalk from "chalk";

import { writeStderrLine } from "./output";

const write = (message: string) => {
  writeStderrLine(message);
};

export const status = (message: string) => {
  write(chalk.dim(message));
};

export const toolStatus = (message: string) => {
  write(chalk.cyanBright(`🛠 ${message}`));
};

export const intentStatus = (message: string) => {
  write(chalk.yellowBright(message));
};

export const warnStatus = (message: string) => {
  write(chalk.yellow(message));
};

export const errorStatus = (message: string) => {
  write(chalk.redBright(message));
};
