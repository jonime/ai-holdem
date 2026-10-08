import "server-only";
import type { JoinGameDictionary } from "../../types";
const dictionary = {
  turnTimer: "Tempo do turno humano: {duration}",
  timerOff: "Desativado",
  timerDuration: "{seconds} segundos",
  title: "Entrar em um jogo", intro: "Escolha uma mesa pública com anfitrião ativo.", back: "Voltar", playerName: "Seu nome (opcional)", namePlaceholder: "Nome do jogador", refresh: "Atualizar", refreshing: "Atualizando…", empty: "Não há mesas públicas disponíveis agora.", retry: "Tentar novamente", warning: "Não foi possível atualizar a disponibilidade. Mostrando as últimas mesas conhecidas.", initialError: "Não foi possível carregar as mesas públicas.", join: "Entrar", joining: "Entrando…", loadMore: "Carregar mais", loadingMore: "Carregando…", unavailable: "Essa mesa não está mais disponível. A lista foi atualizada.", conflict: "Essa mesa mudou. Confira a lista atualizada e tente novamente.", seats: "{occupied}/{total} lugares", people: "{humans} pessoas · {bots} bots", blinds: "Blinds {small}/{big}", stack: "Stack inicial {stack}", fallbackTitle: "Mesa {id}",
} satisfies JoinGameDictionary;
export default dictionary;
