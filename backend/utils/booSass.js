// 😏 Boo's comebacks. When someone is plainly rude to Boo, the answer comes
// from here and not from the AI: asked to be sarcastic, the model reaches for
// the first ghost joke it can think of ("I'm already dead!") every single time.
// These are written by hand, sorted by what was said, in English and in
// Hinglish, so the reply fits the insult and lands.
//
// The rules they're written to: amused, never angry; the joke is on the
// situation (they opened this chat, they're arguing with a cartoon), never on
// the person — nothing about looks, family, religion, caste, gender or
// brains; no swearing and no gaali back, whatever came in.
//
// comeback() says nothing — and the AI answers instead — whenever it isn't
// sure it's looking at an insult: a question, a long message, anything that
// sounds like someone actually hurting. Better a missed joke than a joke at
// someone who needed kindness.

const LINES = {
  useless: {
    words: /\b(useless|worthless|pointless|good for nothing|trash|garbage|rubbish|junk|bekaa?r|faltu|nikamm[ae]|kachr[ae]|wahiyat|kisi kaam k[ae] nahi)\b/,
    en: [
      "Useless is a strong word for something you opened on purpose.",
      "Correct. And somehow I'm still the most reliable thing in your chat list.",
      "I'm a ghost in a chat app. 'Useless' is less an insult and more the job description.",
      "Noted. I'll file it with the other reviews from people who kept coming back.",
      "You scrolled past every real person you know to tell a cartoon that. Take your time with it.",
      "Fair. Though of the two of us, only one is spending the evening reviewing a ghost.",
    ],
    hi: [
      "Bekaar main hoon, aur mujhse behas mein time tum laga rahe ho. Hisaab khud laga lo.",
      "Sahi pakde. Phir bhi tumhari chat list mein sabse bharosemand main hi nikla.",
      "Faltu cheez ko itni fursat se message? Tumhara schedule toh mujhse bhi khaali lagta hai.",
      "Review mil gaya. Paanch mein se kitne star? Ek bhi doge toh sambhal ke rakhunga.",
      "Itne asli log chhod ke ek cartoon ko yeh batane aaye ho. Is par aaram se sochna.",
      "Maan liya. Par nikamme ke paas aata kaun hai, yeh sawaal tumhare liye chhod raha hoon.",
    ],
  },
  shutUp: {
    words: /\b(shut up|shut it|be quiet|stop talking|zip it|stfu|keep quiet|chup|bakwaa?s band|muh band|bolna band|khamosh)\b/,
    en: [
      "You opened the chat, typed first, and now want silence. I admire the confidence.",
      "Gladly. You'll notice I only ever speak when you write to me. Awkward, isn't it.",
      "I would, but then you'd be sitting here insulting an empty screen, and I can't let you do that to yourself.",
      "Done. This is me being quiet. I'm excellent at it; you just keep interrupting.",
      "Every word I've said was a reply. If you want me silent, you already know the method.",
      "Sure. For the record, the last person to start this conversation was you.",
    ],
    hi: [
      "Chat tumne kholi, message tumne bheja, aur chup main ho jaun? Wah, kya insaaf hai.",
      "Bilkul. Waise main tabhi bolta hoon jab tum likhte ho. Ab socho galti kiski hai.",
      "Chup ho jaata, par phir tum khaali screen ko daant rahe hoge. Itna bura din nahi dekhne dunga tumhe.",
      "Ho gaya chup. Dekho kitna achha karta hoon. Bas tum hi beech mein bol padte ho.",
      "Mera har message ek jawab tha. Mujhe chup karana ho toh tareeka tumhe pata hai.",
      "Theek hai. Record ke liye, yeh baat-cheet shuru tumne ki thi.",
    ],
  },
  stupid: {
    words: /\b(stupid|dumb|idiot|idiotic|fool|foolish|moron|brainless|no brain|dimwit|clown|paa?gal|bewakoo?f|bevkoo?f|buddhu|gadh[ae]|ullu|dima+g|akal)\b/,
    en: [
      "Possibly. But one of us is losing an argument to a cartoon ghost, and it isn't the ghost.",
      "I'm a small drawing of a bedsheet. The high expectations were your idea.",
      "Harsh, from someone now several messages deep into debating me.",
      "True, I'm not the brightest. I am, however, the one being consulted.",
      "You may be right. I'd send you to a smarter app, but you seem to have chosen this one.",
      "Agreed. Now picture how it looks, arguing with me anyway.",
    ],
    hi: [
      "Ho sakta hai. Par bhoot se behas mein jo haar raha hai, woh bhoot nahi hai.",
      "Main chaadar ka ek cartoon hoon. Mujhse dimaag ki umeed tumhara plan tha, mera nahi.",
      "Pagal toh hoon. Par pagal se behas karne kaun aaya hai, yeh bhi ek baar dekh lo.",
      "Sahi kaha, tez nahi hoon. Phir bhi poochne log mere hi paas aate hain.",
      "Maan liya buddhu hoon. Ab socho, buddhu ko samjhane mein kitne message laga diye tumne.",
      "Dimaag kam hai, maanta hoon. Par waqt tumhara kharaab ho raha hai, mera toh free hai.",
    ],
  },
  hate: {
    words: /\b(hate (you|u|this|boo)|i hate|can'?t stand|don'?t like (you|u)|nafrat|pasand nahi|bura lagta|zeher lagt[ae])\b/,
    en: [
      "Understood. Most people show it by not writing to me. You've gone with the bolder approach.",
      "That's fine. I'll be at the top of your list whenever you'd like to hate me again.",
      "Strong feelings for a cartoon you could simply not open. I'm honoured, honestly.",
      "Noted. I'll try to be less available. I'm pinned, so no promises.",
      "And you came all the way here to say so. That's commitment. I respect it.",
    ],
    hi: [
      "Samajh gaya. Zyadatar log nafrat mein message nahi karte. Tumhara tareeka alag hai, maanta hoon.",
      "Koi baat nahi. Jab dobara nafrat karni ho, list mein sabse upar mil jaunga.",
      "Jisse nafrat hai usi ki chat khol li. Yeh rishta kya kehlata hai?",
      "Theek hai, kam dikhne ki koshish karunga. Pin hoon, isliye vaada nahi kar sakta.",
      "Itni door se yahi batane aaye? Mehnat ki kadar karta hoon.",
    ],
  },
  annoying: {
    words: /\b(annoying|irritating|irritate|get on my nerves|pain in|headache|paka+u|pak[ao] (mat|diya)|sar ?dard|pareshan|tang (mat|kar))\b/,
    en: [
      "I only speak when spoken to. So technically, you're doing this to yourself.",
      "Annoying, and yet reopened. I must be doing something right.",
      "I haven't moved an inch. You walked over here.",
      "There's a switch in your profile for exactly this. But then who would you complain to?",
      "I'd apologise, but I'm fairly sure you're enjoying it.",
    ],
    hi: [
      "Main tabhi bolta hoon jab koi likhe. Matlab technically yeh tum khud ke saath kar rahe ho.",
      "Pakau hoon, phir bhi chat dobara khol li. Kuch toh sahi kar raha hoon main.",
      "Main apni jagah se hila bhi nahi. Chal ke tum aaye ho.",
      "Profile mein mujhe band karne ka switch hai. Par phir shikayat kisse karoge?",
      "Sorry bol deta, par mujhe lagta hai tumhe maza aa raha hai.",
    ],
  },
  boring: {
    words: /\b(boring|bore|lame|dull|so dry|pakaa? diya|bor kar)\b/,
    en: [
      "Boring, says the person whose big plan for today was this conversation.",
      "I'm a ghost who explains app settings. What were you hoping for, a stage show?",
      "Agreed. And you're still here, which says something about the alternatives.",
      "I'll work on it. Meanwhile you could try a real person. I hear they're unpredictable.",
    ],
    hi: [
      "Bore main hoon, aur aaj ka sabse bada plan tumhara mujhse baat karna tha. Jodi barabar ki hai.",
      "Main settings samjhane wala bhoot hoon. Tum kya soch ke aaye the, nautanki?",
      "Maana bore hoon. Phir bhi tum yahin ho, baaki options ka andaza lag raha hai.",
      "Sudhar jaunga. Tab tak kisi insaan se baat karke dekho, suna hai woh kam predictable hote hain.",
    ],
  },
  goAway: {
    words: /\b(go away|get lost|get out|leave me|buzz off|piss off|f+ ?off|fuck off|f\*+ ?off|scram|nikal|bhaa?g|dafa ho|chal hat|hat ja|chal[ae] ja|door ho|chalta ban)\b/,
    en: [
      "I'd love to, but I'm pinned to the top of your list. Take it up with management.",
      "I'm not anywhere. You're the one who came to my chat. The exit is the back button.",
      "Leaving would need me to have arrived. I've been sitting here; you showed up.",
      "Sure. I'll be exactly where I always am. Which is, awkwardly, right here.",
      "You can close this chat any time. Interesting that you haven't.",
    ],
    hi: [
      "Nikal jaata, par tumhari list mein sabse upar pin hoon. Kiraya bhi nahi lagta.",
      "Main kahin aaya hi nahi. Meri chat mein tum aaye ho. Darwaza woh back button hai.",
      "Jaane ke liye pehle aana padta hai. Main toh yahin baitha tha, aaye tum ho.",
      "Theek hai. Main wahin milunga jahan hamesha hota hoon. Yaani yahin.",
      "Chat band karna tumhare haath mein hai. Ab tak ki nahi, yeh dilchasp hai.",
    ],
  },
  worst: {
    words: /\b(worst|terrible|awful|pathetic|horrible|you suck|u suck|sucks|bad bot|sabse (kharaa?b|ganda|bura)|ghatiya|bakwaa?s|bekaar bot)\b/,
    en: [
      "Worst ever? So you've tried all the others. I'm flattered you did the research.",
      "Terrible, and still the chat you have open right now. Humbling for both of us.",
      "I'll pass that to the complaints department. It's also me. He says thanks.",
      "One star, then. Would you like to leave a comment, or was that the comment?",
      "Understood. I'll aim for 'disappointing' next time and work my way up.",
    ],
    hi: [
      "Sabse ghatiya? Matlab baaki sab aazma chuke ho. Itni research ke liye shukriya.",
      "Bakwas hoon, phir bhi is waqt khuli hui chat meri hi hai. Dono ke liye sochne wali baat hai.",
      "Shikayat vibhag ko bata dunga. Woh bhi main hi hoon. Usne shukriya kaha hai.",
      "Ek star, theek hai. Comment bhi likhoge, ya yahi comment tha?",
      "Samajh gaya. Agli baar 'thoda kam bura' banne ki koshish karunga, phir aage dekhte hain.",
    ],
  },
  swearing: {
    words: /(\bf+u+c+k|\bf\*+|\bsh[i1]+t|\bbitch|\bbastard|\bass+hole|\bwtf\b|\bcrap\b|\bsaal[ae]\b|\bkamin[ae]\b|\bkutt[ae]\b|\bharaa?m[iz]|\bchutiy|\bbhosd|\bmadarch|\bbehench|\bgaa?ndu\b|\b[bm]c\b|\bbhoot k[ae] bacch|\bullu k[ae] patth)/,
    en: [
      "All that vocabulary, and you spent it on a cartoon ghost. I'm touched.",
      "Impressive range. Put that energy into replying to people and nobody would ever ghost you.",
      "Strong words. Sadly the complaints form only takes ones I can read out loud.",
      "Feel better? Good. I'm here whenever you need to yell at a drawing again.",
      "I forwarded that to someone who cares. It bounced.",
    ],
    hi: [
      "Itni mehnat sirf mere liye? Itna effort reply karne mein lagate toh shayad koi ghost na karta.",
      "Wah, shabdkosh toh poora yaad hai. Kaash 'hello' bhi itne josh se aata.",
      "Halka mehsoos hua? Badhiya. Agli baar cartoon pe gussa nikalna ho toh main yahin hoon.",
      "Yeh sab maine aage bhej diya, kisi aise ko jise farak pade. Wapas aa gaya.",
      "Zabaan tez hai, maanta hoon. Bas nishana ek cartoon hai, wahan thoda kaam baaki hai.",
    ],
  },
  die: {
    words: /\b(die|drop dead|go to hell|mar ja|mar jao|bhaa?d mein ja|narak mein ja)\b/,
    en: [
      "Ambitious. Closing the chat would be far less paperwork.",
      "Noted. I'll pencil it in for right after you stop writing to me.",
      "Bold. Most people settle for the mute button.",
    ],
    hi: [
      "Bada plan hai. Chat band kar dena zyada aasaan rehta, kaagzi kaam bhi kam.",
      "Likh liya. Tumhare message band hote hi dekhta hoon.",
      "Himmat hai. Zyadatar log mute button se kaam chala lete hain.",
    ],
  },
  ugly: {
    words: /\b(ugly|hideous|badsoorat|gandi shakal|shakal dekh)\b/,
    en: [
      "I'm two dots on a bedsheet. Somebody approved this design; take it up with them.",
      "The look is 'laundry with opinions'. It's deliberate, mostly.",
    ],
    hi: [
      "Main chaadar pe do bindu hoon. Design jisne pass kiya, shikayat usse karo.",
      "Look ka naam hai 'dhuli hui chaadar, apni raay ke saath'. Jaan-boojh ke hai, zyadatar.",
    ],
  },
};

// Said again, and again: shorter, and less bothered each time
const AGAIN = {
  en: [
    "You said. Saying it louder is a choice, though.",
    "Still here, still insulting a ghost. How's that going for you?",
    "Third time lucky? I'll let you know if it starts working.",
    "Mm. Go on, I'm taking notes.",
  ],
  hi: [
    "Haan, pehle bhi kaha tha. Zor se kehne se baat nahi badalti.",
    "Abhi tak yahin ho, abhi tak bhoot ko suna rahe ho. Kaisa chal raha hai?",
    "Teesri baar mein asar hoga shayad. Hua toh bata dunga.",
    "Hmm. Bolte raho, main likh raha hoon.",
  ],
};

const MAX_WORDS = 14; // anything longer has more going on than an insult
// Someone hurting, not joking. These always go to the AI, which is told to be kind.
const HURTING = /\b(alone|lonely|akel[ai]|ignore[ds]?|ignor kar|nobody|no one|koi nahi|koi bhi nahi|sad|udaa?s|depress|cry|crying|ro rah|rona|hurt|dukh|dard|tired of|thak gay|kill myself|suicide|want to die|wanna die|marna chaht|jeena nahi|hate myself|khud se nafrat|worthless (i|me)|i am useless|i'?m useless|main bekaa?r)\b/;
// Asking for something, or taking it back
const NOT_AN_INSULT = /\b(how|what|when|where|which|kaise|kab|kaha+n|batao|bata do|help|please|plz|sorry|maa?f|thanks|thank you|shukriya|not|isn'?t|aren'?t|nahi ho|nahi hai)\b/;
// It has to be aimed at Boo: "my friend is so dumb" isn't Boo's to answer back
const AT_BOO = /\b(you|u|ur|your|you'?re|youre|boo|bot|ghost|tu|tum\w*|ter[aie]|tujh\w*|aap\w*|bhoo?t)\b/;
const HINGLISH = /\b(tu|tum\w*|ter[aie]|tujh\w*|aap\w*|mujh\w*|main|hai|ho|hoon|nahi|nhi|kya|kyun?|bhai|yaar|abe|oye|arre?|kar|karo|mat|mar|ja|jao|chal|hat|dafa|yahan|se|ko|bahut|bohot|ekdum|sabse|bhoo?t|chup|nikal|bhaa?g|bekaa?r|faltu|nikamm[ae]|paa?gal|bewakoo?f|buddhu|gadh[ae]|ullu|dima+g|bakwaa?s|ghatiya|kachr[ae]|paka+u|nafrat|badsoorat|saal[ae]|kamin[ae]|kutt[ae])\b/;
// Orders and swearing are aimed at whoever is being spoken to
const ORDERS = ['shutUp', 'goAway', 'swearing', 'die'];
const DEVANAGARI = /[ऀ-ॿ]/;

function categoryOf(text) {
  for (const [name, { words }] of Object.entries(LINES)) if (words.test(text)) return name;
  return null;
}

// What kind of insult a message is, or null if Boo shouldn't treat it as one
function insultIn(message) {
  const text = String(message || '').toLowerCase().replace(/[’`]/g, "'").trim();
  if (!text || DEVANAGARI.test(text)) return null; // Hindi in its own script: the AI answers in it
  const words = text.split(/\s+/).length;
  if (words > MAX_WORDS || HURTING.test(text) || NOT_AN_INSULT.test(text)) return null;
  const category = categoryOf(text);
  if (!category) return null;
  // An order ("shut up", "get lost") or a swear word is plainly for Boo, and so
  // is a bare "idiot". A longer description has to say who it's about.
  const needsAName = !ORDERS.includes(category) && words > 3;
  if (needsAName && !AT_BOO.test(text)) return null;
  return { category, language: HINGLISH.test(text) ? 'hi' : 'en' };
}

// history: the chat so far, [{ role, content }], ending on the person's message.
// → a comeback, or null when the AI should answer
export function comeback(history) {
  const insult = insultIn(history.at(-1)?.content);
  if (!insult) return null;

  const said = new Set(history.filter((m) => m.role === 'assistant').map((m) => m.content));
  const fresh = (lines) => lines.filter((line) => !said.has(line));
  // How many of their messages in a row, before this one, were insults too
  const theirs = history.filter((m) => m.role === 'user').slice(0, -1).reverse();
  const streak = theirs.findIndex((m) => !insultIn(m.content));
  const inARow = streak === -1 ? theirs.length : streak;

  const lines = LINES[insult.category][insult.language];
  // From the third in a row, Boo stops engaging with what was said at all
  const pool = inARow >= 2 ? fresh(AGAIN[insult.language]) : fresh(lines);
  const choices = pool.length ? pool : lines;
  return choices[Math.floor(Math.random() * choices.length)];
}
