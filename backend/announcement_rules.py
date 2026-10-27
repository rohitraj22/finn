"""Transparent, provisional keyword rules based on the ENAM reference categories.

These classify the exchange's subject and text, not the contents of the attachment.
No generated summaries or assertions about financial materiality.
"""
import json
from pathlib import Path
import re

CATEGORIES = json.loads((Path(__file__).resolve().parents[1] / 'data/announcement-categories.json').read_text())
RULES = [
    ('management_change', r'change in (?:senior )?(?:management|managing director|director|chief (?:executive|financial))|resignation|retirement of.{0,40}(director|ceo|cfo|managing)|appoint.{0,80}(chief executive|chief financial|managing director|whole.time director|independent director)|(?:ceo|cfo|director).{0,60}(?:appoint|resign|retir|cessation)'),
    ('m_and_a', r'\bacquisition\b|\bmerger\b|\bdemerger\b|amalgamation|joint venture|sale of.{0,50}(stake|subsidiary)|invest.{0,40}(subsidiary|stake)'),
    ('capex', r'\bcapex\b|capital expenditure|capacity expansion|new (plant|manufacturing facility)|commission.{0,40}(plant|facility)'),
    ('fund_raise', r'fund.?rais|raising.{0,20}(capital|funds)|rights issue|\bqip\b|qualified institutional|preferential (issue|allotment)|buy.?back|commercial paper|debentures?|issuance of.{0,25}bonds?|issue of securities'),
    ('litigation', r'litigation|insolvency|regulatory order|penalt(?:y|ies)|\bfines?\b|action\(s\) taken|winding.up|lawsuit|show cause|regulatory warning'),
    ('results', r'financial results|quarterly results|annual results|audited results|unaudited results|results (presentation|deck)|shareholder letter|publication of.{0,30}results'),
    ('dividend', r'\bdividends?\b'),
    ('bonus_split', r'bonus (issue|shares)|stock split|split of.{0,20}shares|sub.?division of.{0,20}shares'),
    ('credit_rating', r'credit rating|rating.{0,30}(upgrade|downgrade|reaffirm)|rating agency'),
    ('pledging', r'pledg(?:e|ed|ing)|encumbrance'),
    ('insider_trading', r'insider trading|promoter.{0,40}(buy|sell|sale|purchase)|disclosure.{0,25}(pit|sast)|regulation 7\(2\)'),
    ('earnings_call', r'earnings.call|conference call|concall|transcript|audio recording|video recording|link of recording'),
    ('investor_meetings', r'investor meet|analyst.{0,30}meet|investor conference|institutional investor'),
    ('postal_ballot', r'postal ballot'),
    ('agm_egm', r'annual general meeting|extra.?ordinary general meeting|\bagm\b|\begm\b|shareholders meeting'),
    ('press_release', r'press release|order.{0,15}(win|contract)|bagging/receiving|new product|partnership|rumou?r|clarification'),
]
HIGH = {'results','management_change','m_and_a','capex','fund_raise','litigation'}
ROUTINE = {'investor_meetings','postal_ballot','agm_egm'}


def classify(title: str, description: str) -> tuple[list[str], str, str]:
    text = f'{title} {description}'.lower()
    found = [key for key, pattern in RULES if re.search(pattern, text)]
    # Call notices mentioning results aren't themselves the publication of results.
    if 'earnings_call' in found:
        found = [key for key in found if key not in {'results', 'investor_meetings'}]
    # Employee allotments aren't external fundraising; auditor changes aren't executive changes.
    if re.search(r'\besop\b|esos|esps|employee stock|statutory auditor|secretarial auditor', text):
        found = [key for key in found if key not in {'fund_raise','management_change'}]
    if not found:
        routine = bool(re.search(r'compliance|certificate|trading window|\besop\b|esos|esps|employee stock|auditor|esg report|regulation 74', text))
        return ['unclassified'], 'Routine' if routine else 'Medium', ('Routine administrative keyword matched.' if routine else 'No specific category rule matched; review the original filing.')
    priority = 'High' if any(key in HIGH for key in found) else 'Routine' if all(key in ROUTINE for key in found) else 'Medium'
    return found, priority, 'Keyword rule: ' + ', '.join(CATEGORIES[key] for key in found) + '. Provisional label; no AI or document analysis.'
