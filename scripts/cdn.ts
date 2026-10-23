// The public contract between the uploader and whatever embeds the cards.
export const PUBLIC_BASE = 'https://r2.kuriyona.com';
export const KEY_PREFIX = 'img/readme';

export const publicUrl = (name: string) => `${PUBLIC_BASE}/${KEY_PREFIX}/${name}`;
