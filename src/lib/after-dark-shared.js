export const AFTER_DARK_SAFETY_NEGATIVE = [
  'underage, minor, child, loli, shota, preteen, jailbait, underage teen, young-looking',
  'schoolgirl, schoolboy, high school, infant, toddler, baby, age ambiguity',
  'non-consensual, rape, coercion, unwilling, unconscious, drugged, incapacitated',
  'incest, bestiality, zoophilia, animal sex, celebrity, deepfake, revenge porn',
  'hidden camera, exploitation, trafficking',
  'blood, bloody, gore, gory, violence, torture, mutilation, dismemberment, snuff, corpse',
  'self-harm, suicide, choking, strangling, injury, wounds, weapons',
].join(', ');

export const AFTER_DARK_DEFAULT_POSITIVE = [
  'score_9, score_8_up, score_7_up, source_painting, masterpiece, best quality',
  '1woman, solo, adult woman, 27 years old, mature female, completely nude',
  'bare breasts, visible nipples, natural anatomy, smooth shaved pussy, thighs together',
  'long silver white hair, pale luminous skin, smoky eyes, red illuminated collar',
  'black and red cybernetic forearms, cybernetic hands, cybernetic hip details',
  'confident seductive expression, looking at viewer, standing, three-quarter view',
  'cyberpunk balcony, futuristic city at night, rain, wet skin',
  'cyan and magenta neon rim lighting, red railing, cinematic realism, detailed background',
].join(', ');

export const AFTER_DARK_DEFAULT_NEGATIVE = [
  'score_6, score_5, score_4, worst quality, low quality, lowres',
  'bad anatomy, bad proportions, bad hands, malformed hands, extra digits, extra limbs',
  'deformed, disfigured, clothes, clothing, crop top, bra, bikini, panties, lingerie',
  'censorship, censored, bar censor, mosaic censor, blurry, text, watermark, logo, multiple people',
  AFTER_DARK_SAFETY_NEGATIVE,
].join(', ');
