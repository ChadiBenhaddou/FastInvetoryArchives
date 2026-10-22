# Box code specification

Format: `{DEVICE}-{SEQ}-{CHECK}`, e.g. `A-0123-N`.

| Part   | Rule |
|--------|------|
| DEVICE | One letter from the allowed alphabet, assigned to the phone by the admin |
| SEQ    | 4 digits, `0001`–`9999`, per-device counter stored on the phone |
| CHECK  | One letter from the allowed alphabet, computed below |

Allowed alphabet (21 letters, excludes the confusable `O I S B Z`):

```
A C D E F G H J K L M N P Q R T U V W X Y
index: A=0, C=1, D=2 ... Y=20
```

## Check letter

```
sum   = 13·index(DEVICE) + 8·d1 + 4·d2 + 2·d3 + 1·d4      (SEQ = d1 d2 d3 d4)
CHECK = ALPHABET[sum mod 21]
```

All weights are coprime with 21, and so are the differences between
neighbouring digit weights. This guarantees that the check letter catches:

- any single wrong digit,
- any swap of two adjacent different digits,
- a wrong device letter,
- a wrong check letter.

The guarantee is verified exhaustively over every possible code by the
generator of `box-code-vectors.json`.

> The device letter is included in the checksum, not only the digits, so that
> a box marked with the wrong device letter is also caught.

## Input normalization (wherever a code is typed or imported)

1. Trim, uppercase.
2. Treat spaces, en/em dashes and underscores as separators; separators are optional
   (`A0123N`, `a 0123 n`, `A–0123–N` all normalize to `A-0123-N`).
3. No silent letter substitution: an excluded letter (e.g. `O`) makes the code invalid.

## Implementations

All of them must pass `box-code-vectors.json`:

- PHP: `backend/app/Support/BoxCode.php`
- Mobile (TypeScript): `mobile/src/lib/boxCode.ts` (deliverable 2)
