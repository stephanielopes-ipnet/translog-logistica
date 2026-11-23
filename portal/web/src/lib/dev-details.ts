/**
 * Detalhes para a equipe (origem real/simulada do dado, texto para a IA, linha do tempo bruta).
 * Aparecem no `pnpm dev`; somem no build de produção, ou seja, na imagem Docker.
 */
export const SHOW_DEV_DETAILS: boolean = import.meta.env.DEV;
