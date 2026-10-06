import "server-only";
import directory from "../join-game/pt-BR";
const dictionary = {
  "title": "Jogar",
  "intro": "Volte às suas mesas ou encontre uma mesa pública aberta.",
  "createTable": "Criar mesa",
  "yourTables": "Suas mesas",
  "browserTables": "Estas mesas pertencem a este navegador. Voltar não garante o início de outra mão.",
  "recentlyActive": "Atividade recente",
  "returnToTable": "Voltar à mesa",
  "personalError": "Não foi possível carregar suas mesas.",
  "retry": "Tentar novamente",
  "publicTables": "Mesas públicas abertas",
  "refreshAll": "Atualizar todas as mesas",
  "refreshing": "Atualizando…",
  "loadingPersonal": "Carregando suas mesas…",
  "loadingPublic": "Carregando mesas públicas…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Aguardando", "playing": "Em jogo", "complete": "Mão concluída", "error": "Erro"}
} as const;
export default dictionary;
