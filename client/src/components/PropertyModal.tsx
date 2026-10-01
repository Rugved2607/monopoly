import type { BoardDef, ClientState, Space } from '../../../shared/types';
import { inr } from '../lib/format';
import { net } from '../lib/net';
import { Modal } from './Modal';

function Row({ label, value, on = false }: { label: string; value: string; on?: boolean }) {
  return (
    <div className={'flex justify-between rounded-md px-2 py-1 ' + (on ? 'bg-marigold-500/25 font-extrabold text-marigold-300' : '')}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

const unmortgageCost = (sp: Space) => Math.ceil(((sp.mortgage ?? 0) * 1.1) / 10) * 10;

export default function PropertyModal({ spaceId, board, state, onClose, onTrade }: { spaceId: number; board: BoardDef; state: ClientState; onClose: () => void; onTrade: (spaceId: number) => void }) {
  const sp = board.spaces[spaceId];
  const st = state.props[spaceId];
  const group = sp.groupId !== undefined ? board.groups[sp.groupId] : undefined;
  const owner = st?.owner ? state.players.find((p) => p.id === st.owner) : undefined;
  const me = state.players.find((p) => p.id === state.youId)!;
  const acts = state.legal.props[spaceId];
  const canBuyHere = state.legal.canBuy && me.position === spaceId;
  const canTrade = state.legal.canTrade && !!owner && owner.id !== me.id && !owner.bankrupt;
  const run = (type: 'build' | 'sellHouse' | 'mortgage' | 'unmortgage') => net.act({ type, spaceId });
  const ownedCount = owner ? board.spaces.filter((s) => s.kind === sp.kind && state.props[s.id]?.owner === owner.id).length : 0;
  const header = group?.color ?? (sp.kind === 'transport' ? '#3b4a8c' : sp.kind === 'utility' ? '#51607a' : '#3a2d86');

  return (
    <Modal onClose={onClose} label={sp.name}>
      <div className="overflow-hidden rounded-2xl bg-paper-50 text-night-950 shadow-lg">
        <div className="px-5 py-4 text-white" style={{ background: header, textShadow: '0 1px 0 rgba(0,0,0,.3)' }}>
          <div className="text-xs font-bold opacity-90">{group ? `${group.name} · ${sp.kind === 'property' ? 'City' : ''}` : sp.kind === 'transport' ? 'Transport hub' : sp.kind === 'utility' ? 'Utility' : ''}</div>
          <h2 className="font-display text-3xl leading-tight">
            {sp.icon ? sp.icon + ' ' : ''}
            {sp.name}
          </h2>
          {sp.subtitle && <div className="text-sm opacity-90">{sp.subtitle}</div>}
        </div>

        {(sp.kind === 'property' || sp.kind === 'transport' || sp.kind === 'utility') && (
          <div className="space-y-0.5 px-4 py-3 text-sm">
            <Row label="Price" value={inr(sp.price!)} />
            {sp.kind === 'property' && (
              <>
                <Row label="Base rent" value={inr(sp.rents![0])} on={!!st && st.houses === 0} />
                <Row label="Rent with full colour set" value={inr(sp.rents![0] * 2)} />
                {[1, 2, 3, 4].map((h) => (
                  <Row key={h} label={`${h} house${h > 1 ? 's' : ''}`} value={inr(sp.rents![h])} on={st?.houses === h} />
                ))}
                <Row label="Hotel" value={inr(sp.rents![5])} on={st?.houses === 5} />
                <Row label="Building cost (each)" value={inr(sp.houseCost!)} />
              </>
            )}
            {sp.kind === 'transport' &&
              [1, 2, 3, 4, 5].map((n) => <Row key={n} label={`${n} hub${n > 1 ? 's' : ''} owned`} value={inr(sp.rents![n])} on={ownedCount === n} />)}
            {sp.kind === 'utility' &&
              [1, 2, 3].map((n) => <Row key={n} label={`${n} utilit${n > 1 ? 'ies' : 'y'} owned`} value={`${board.utilityMultipliers[n]}× dice`} on={ownedCount === n} />)}
            <Row label="Mortgage value" value={inr(sp.mortgage!)} />
            <div className="mt-2 flex items-center justify-between rounded-lg bg-night-950/5 px-2 py-2">
              <span className="font-semibold">Owner</span>
              {owner ? (
                <span className="flex items-center gap-2 font-bold">
                  <span className="h-3 w-3 rounded-full" style={{ background: owner.color }} />
                  {owner.name}
                  {st.mortgaged && <span className="chip bg-night-950/10 text-night-950">Mortgaged</span>}
                </span>
              ) : (
                <span className="text-night-950/60">Unowned</span>
              )}
            </div>
          </div>
        )}
        {sp.kind === 'tax' && <p className="px-5 py-4">Pay {inr(sp.amount!)} to the bank when you land here.</p>}
        {(sp.kind === 'khazana' || sp.kind === 'bhagya') && <p className="px-5 py-4">Draw a card and follow its instructions. Cards can pay out, charge fees, move your token, or send you to jail.</p>}
        {sp.kind === 'go' && <p className="px-5 py-4">Collect {inr(state.settings.goSalary)} every time you pass or land on GO.</p>}
        {sp.kind === 'jail' && <p className="px-5 py-4">Just visiting, unless you were sent here. To leave, roll doubles, pay {inr(board.jailFine)}, or use a Get Out of Jail Free card. After three failed rolls you pay the fine.</p>}
        {sp.kind === 'goToJail' && <p className="px-5 py-4">Land here and you go straight to jail without collecting your salary.</p>}
        {sp.kind === 'freeParking' && <p className="px-5 py-4">A quiet stop. Nothing happens here.</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canBuyHere && (
          <button className="btn-primary flex-1" onClick={() => net.act({ type: 'buy' }).then(onClose)}>
            Buy for {inr(sp.price!)}
          </button>
        )}
        {acts?.build && (
          <button className="btn-peacock flex-1" onClick={() => run('build')}>
            Build · {inr(sp.houseCost!)}
          </button>
        )}
        {acts?.sell && (
          <button className="btn-ghost flex-1" onClick={() => run('sellHouse')}>
            Sell building · +{inr(sp.houseCost! / 2)}
          </button>
        )}
        {acts?.mortgage && (
          <button className="btn-ghost flex-1" onClick={() => run('mortgage')}>
            Mortgage · +{inr(sp.mortgage!)}
          </button>
        )}
        {acts?.unmortgage && (
          <button className="btn-primary flex-1" onClick={() => run('unmortgage')}>
            Unmortgage · {inr(unmortgageCost(sp))}
          </button>
        )}
        {canTrade && (
          <button className="btn-ghost flex-1" onClick={() => onTrade(spaceId)}>
            Trade with {owner!.name}
          </button>
        )}
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
