import { Boards } from "./collections/Boards";
import { Changelog } from "./collections/Changelog";
import { ChangelogLabels } from "./collections/ChangelogLabels";

export const collections = [Boards, Changelog, ChangelogLabels];
export { settings } from "./settings";
export { seed } from "./seed";
export { migrations } from "./migrations";
