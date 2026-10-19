export interface AsciiArt {
  name: string
  path: string
  content: string
}

const FUNNY_CAT = [
  '      /\\_/\\',
  '     ( o.o )',
  '      > ^ <',
  '     /     \\',
  '    (  _____ )',
  '     \\_/   \\_/',
].join('\n')

const FISH_CAT = [
  '        __',
  '   ___ /  \\',
  '  /   |    \\',
  ' <    |     >',
  '  \\___|____/',
  '      \\__/',
  '',
  '  [ packet accepted ]',
].join('\n')

const MATRIX_CAT = [
  '01001000 01100101 01101100 01101100 01101111',
  '01010111 01101111 01110010 01101100 01100100',
  '   1010  0101  1100  0011',
  '      [ sync ok ]',
].join('\n')

export const ASCII_ARTS: readonly AsciiArt[] = [
  { name: 'funny.cat', path: 'ascii/funny.cat', content: FUNNY_CAT },
  { name: 'fish.cat', path: 'ascii/fish.cat', content: FISH_CAT },
  { name: 'matrix.cat', path: 'ascii/matrix.cat', content: MATRIX_CAT },
]

export function findAsciiArt(name: string): AsciiArt | undefined {
  const normalized = name.replace(/^\.?\//, '').replace(/^ascii\//, '')
  return ASCII_ARTS.find((art) => art.name === normalized || art.path === name)
}
