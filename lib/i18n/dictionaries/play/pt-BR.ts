import "server-only";
import directory from "../join-game/pt-BR";
const dictionary = {
  "title": "Jogar",
  "intro": "Volte às suas mesas ou encontre uma mesa pública aberta.",
  "quickPlay": "Jogo rápido contra IA",
  "createTable": "Criar mesa",
  deleteTable: "Excluir mesa",
  leaveAndRemove: "Sair e remover",
  deleteBlocked: "Outros jogadores humanos ainda ocupam assentos. Eles precisam liberá-los antes de excluir a mesa.",
  confirmDelete: "Excluir “{title}”? O histórico e o link compartilhado serão removidos permanentemente.",
  confirmLeave: "Sair e remover “{title}”? A saída é irreversível durante uma mão. Assentos em espera ou com a mão concluída são liberados imediatamente; jogadores ativos desistem no próximo turno legal. Jogadores all-in mantêm o direito ao pote.",
  removalConflict: "A mesa mudou. Confira a lista atualizada e tente novamente.",
  removalFailed: "Não foi possível remover a mesa. Tente novamente.",
  "yourTables": "Suas mesas",
  "returnToTable": "Voltar à mesa",
  "personalError": "Não foi possível carregar suas mesas.",
  "retry": "Tentar novamente",
  "publicTables": "Mesas públicas abertas",
  "refreshing": "Atualizando…",
  "loadingPersonal": "Carregando suas mesas…",
  "loadingPublic": "Carregando mesas públicas…",
  fallbackTitle: directory.fallbackTitle, seats: directory.seats,
  statuses: {"waiting": "Aguardando", "playing": "Em jogo", "complete": "Mão concluída", "error": "Erro"}
} as const;
export default dictionary;
