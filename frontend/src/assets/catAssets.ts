// All GIF URLs are stable Giphy CDN direct links — no API key, no redirects.
// media.giphy.com/media/{id}/giphy.gif are permanent content-addressed URLs.

export interface CatAsset {
  id: string
  url: string
  label: string
}

// 12 cat avatars — displayed in the avatar picker on game join
export const CAT_AVATARS: CatAsset[] = [
  { id: 'a1', url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',    label: 'Judgy'    },
  { id: 'a2', url: 'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif',    label: 'Sneaky'   },
  { id: 'a3', url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',    label: 'Dramatic' },
  { id: 'a4', url: 'https://media.giphy.com/media/BzyTuYCmvSORqs1ABM/giphy.gif', label: 'Loaf'   },
  { id: 'a5', url: 'https://media.giphy.com/media/nR4L10XlJcSeQ/giphy.gif',    label: 'Boop'     },
  { id: 'a6', url: 'https://media.giphy.com/media/GeimqsH0TLDt4tScGw/giphy.gif', label: 'Zoomies' },
  { id: 'a7', url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',    label: 'Grumpy'   },
  { id: 'a8', url: 'https://media.giphy.com/media/3oriO13KTkzPwTykp2/giphy.gif', label: 'Flop'   },
  { id: 'a9', url: 'https://media.giphy.com/media/ule4vhcY1xEKQ/giphy.gif',    label: 'Chaos'    },
  { id: 'a10', url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',   label: 'Smug'     },
  { id: 'a11', url: 'https://media.giphy.com/media/8vQSQ3cNXuDGo/giphy.gif',   label: 'Sleepy'   },
  { id: 'a12', url: 'https://media.giphy.com/media/H4uE6w9m8syvm/giphy.gif',   label: 'Derpy'    },
]

// 12 reaction GIFs for the in-chat GIF picker
export const CHAT_CAT_GIFS: CatAsset[] = [
  { id: 'g1',  url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',    label: 'judge'   },
  { id: 'g2',  url: 'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif',    label: 'sneak'   },
  { id: 'g3',  url: 'https://media.giphy.com/media/GeimqsH0TLDt4tScGw/giphy.gif', label: 'zoom'  },
  { id: 'g4',  url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',    label: 'grumpy'  },
  { id: 'g5',  url: 'https://media.giphy.com/media/ule4vhcY1xEKQ/giphy.gif',    label: 'chaos'   },
  { id: 'g6',  url: 'https://media.giphy.com/media/3oriO13KTkzPwTykp2/giphy.gif', label: 'flop'  },
  { id: 'g7',  url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',    label: 'drama'   },
  { id: 'g8',  url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',    label: 'smug'    },
  { id: 'g9',  url: 'https://media.giphy.com/media/8vQSQ3cNXuDGo/giphy.gif',    label: 'sleepy'  },
  { id: 'g10', url: 'https://media.giphy.com/media/H4uE6w9m8syvmh/giphy.gif',   label: 'derpy'   },
  { id: 'g11', url: 'https://media.giphy.com/media/nR4L10XlJcSeQ/giphy.gif',    label: 'boop'    },
  { id: 'g12', url: 'https://media.giphy.com/media/BzyTuYCmvSORqs1ABM/giphy.gif', label: 'loaf'  },
]

// Magic prefixes for special chat messages — never shown as text bubbles
export const GIF_MESSAGE_PREFIX    = '__gif__:'
export const AVATAR_MESSAGE_PREFIX = '__avatar__:'
