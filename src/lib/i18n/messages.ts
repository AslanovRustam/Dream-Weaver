import type { Locale } from "./config";

import { ru } from "./messages/ru";
import { en } from "./messages/en";
import { uk } from "./messages/uk";

export type { Messages, Full } from "./messages/ru.types";

export const MESSAGES: Record<Locale, unknown> = { ru, en, uk };
export const SOURCE = ru;
