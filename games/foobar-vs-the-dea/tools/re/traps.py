"""Build a Toolbox/OS trap table from multiversal's YAML definitions."""
import yaml, glob, json, os, sys

def load(defs_dir):
    traps = {}          # trapword -> list of entries
    for f in sorted(glob.glob(os.path.join(defs_dir, '*.yaml'))):
        try:
            docs = yaml.safe_load(open(f))
        except Exception as e:
            continue
        if not isinstance(docs, list):
            continue
        for item in docs:
            if not isinstance(item, dict) or 'function' not in item:
                continue
            fn = item['function']
            t = fn.get('trap')
            if t is None:
                continue
            if isinstance(t, str):
                t = int(t, 16)
            ent = {
                'name': fn.get('name'),
                'args': [(a.get('name'), a.get('type'), a.get('register')) for a in (fn.get('args') or [])],
                'ret': fn.get('return'),
                'returnreg': fn.get('returnreg'),
                'selector': fn.get('selector'),
                'dispatcher': fn.get('dispatcher'),
                'file': os.path.basename(f),
            }
            traps.setdefault(t, []).append(ent)
    return traps

def name_for(traps, word):
    """Best name for a trap word. OS traps (A0xx-A7xx) ignore flag bits 9-10."""
    cands = traps.get(word)
    if not cands and (word & 0x0800) == 0:          # OS trap: strip autopop/flag bits
        base = word & 0xF8FF
        for k in (base, base | 0x0100, base | 0x0200, base | 0x0400, base | 0x0600):
            if k in traps:
                cands = traps[k]; break
    if not cands:
        return None, None
    # prefer non-selector (plain) entry
    plain = [c for c in cands if c['selector'] is None]
    c = (plain or cands)[0]
    return c['name'], c

if __name__ == '__main__':
    t = load(sys.argv[1])
    print(len(t), 'trap words')
    for w in (0xAA1E, 0xA9A0, 0xA975, 0xA861, 0xA122, 0xA02E, 0xA9F0, 0xA8EC, 0xA805, 0xA807, 0xA803):
        print(hex(w), name_for(t, w)[0])
