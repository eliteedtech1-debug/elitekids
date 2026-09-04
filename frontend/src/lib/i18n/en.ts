/**
 * English dictionary — consolidated from alphabetically sorted chunk files
 * (chunks/en-*.ts). Keys resolve identically to a single flat object.
 *
 * ADDING A KEY: find the chunk matching the key's first letter and insert it
 * in alphabetical position. Do NOT add entries directly to this file.
 */
import { enAC } from './chunks/en-a-c';
import { enDF } from './chunks/en-d-f';
import { enGI } from './chunks/en-g-i';
import { enJL } from './chunks/en-j-l';
import { enMO } from './chunks/en-m-o';
import { enPR } from './chunks/en-p-r';
import { enS } from './chunks/en-s';
import { enTV } from './chunks/en-t-v';
import { enWZ } from './chunks/en-w-z';

export const en: Record<string, string> = {
  ...enAC, ...enDF, ...enGI, ...enJL, ...enMO, ...enPR, ...enS, ...enTV, ...enWZ
};
