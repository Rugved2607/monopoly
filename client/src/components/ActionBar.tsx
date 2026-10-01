import type { BoardDef, ClientState } from '../../../shared/types';
import { inr } from '../lib/format';
import { net } from '../lib/net';
import { TokenDot } from './Panels';

export default function ActionBar({ state, board, tokens }: { state: ClientState; board: BoardDef; tokens: { id: string; emoji: string }[] }) {
  const cur = state.players.find((p) => p.id === state.currentPlayerId);
  const me = state.players.find((p) => p.id === state.youId)!;
  const L = state.legal;
  const mine = cur?.id === me.id;
  const sp = cur ? board.spaces[cur.position] : undefined;
  const debtor = state.debt ? state.players.find((p) => p.id === state.debt!.debtorId) : undefined;
  const creditor = state.debt?.creditorId ? state.players.find((p) => p.id === state.debt!.creditorId) : undefined;

  const resign = () => {
    if (window.confirm('Declare bankruptcy? You will leave the game and your assets go to the creditor or the bank.')) net.act({ type: 'resign' });
  };

  let info: string;
  if (!cur) info = '';
  else if (state.phase === 'auction') info = `Auction for ${board.spaces[state.auction!.spaceId].name}`;
  else if (state.phase === 'debt' && debtor) info = debtor.id === me.id ? `You owe ${inr(state.debt!.amount)} ${creditor ? 'to ' + creditor.name : 'to the bank'} ${state.debt!.reason}` : `${debtor.name} must raise ${inr(state.debt!.amount)}`;
  else if (mine && state.phase === 'roll') info = me.inJail ? 'You are in jail. Roll for doubles, pay the fine, or use a card.' : state.rolledDoubles ? 'Doubles! Roll again.' : 'Your turn. Roll the dice.';
  else if (mine && state.phase === 'buy') info = `${sp!.name} is for sale at ${inr(sp!.price!)}. Buy it, or auction it to everyone.`;
  else if (mine && state.phase === 'end') info = 'Manage your properties or trade, then end your turn.';
  else info = `Waiting for ${cur.name}…`;

  return (
    <div className="border-t border-white/10 bg-night-900/95 px-3 py-2.5 backdrop-blur" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2">
        {cur && (
          <div className="flex min-w-0 items-center gap-2.5">
            <TokenDot tokens={tokens} token={cur.token} color={cur.color} size="h-10 w-10 text-xl" />
            <div className="min-w-0">
              <div className="truncate text-sm text-white/60">Current player</div>
              <div className="truncate font-extrabold leading-tight">
                {cur.name}
                {mine && ' (you)'}
              </div>
            </div>
          </div>
        )}
        <p className="min-w-[12rem] flex-1 text-sm font-semibold text-white/85" aria-live="polite">
          {info}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {L.canRoll && (
            <>
              <button className="btn-primary animate-pulseRing text-lg" onClick={() => net.act({ type: 'roll' })}>
                🎲 Roll dice
              </button>
              {me.inJail && (
                <>
                  <button className="btn-ghost" disabled={!L.canPayJail} onClick={() => net.act({ type: 'payJail' })}>
                    Pay {inr(board.jailFine)} fine
                  </button>
                  {L.canUseJailCard && (
                    <button className="btn-ghost" onClick={() => net.act({ type: 'useJailCard' })}>
                      Use jail card
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {mine && state.phase === 'buy' && (
            <>
              <button className="btn-primary" disabled={!L.canBuy} onClick={() => net.act({ type: 'buy' })}>
                Buy · {inr(sp!.price!)}
              </button>
              <button className="btn-ghost" onClick={() => net.act({ type: 'declineBuy' })}>
                {state.settings.auctions ? 'Auction it' : 'Pass'}
              </button>
            </>
          )}
          {L.canEndTurn && (
            <button className="btn-peacock" onClick={() => net.act({ type: 'endTurn' })}>
              End turn
            </button>
          )}
          {state.phase === 'debt' && debtor?.id === me.id && (
            <>
              <button className="btn-primary" disabled={!L.canPayDebt} onClick={() => net.act({ type: 'payDebt' })}>
                Pay {inr(state.debt!.amount)}
              </button>
              <button className="btn-danger" onClick={resign}>
                Declare bankruptcy
              </button>
            </>
          )}
          {L.canResign && state.phase !== 'debt' && (
            <button className="btn-ghost btn-sm" onClick={resign} title="Leave the game">
              Resign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
