# Evaluation report

- generated: `2026-10-04 18:23:38`
- corpus: `cat.txt` (150 chunks, 768-d embeddings)
- embedding model: `hf.co/CompendiumLabs/bge-base-en-v1.5-gguf`
- language model: `hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF`
- cases: 68 (58 answerable, 10 unanswerable)

## Retrieval

| config | hit@k | mrr@k | precision@k | recall@k | mean top score | ret ms | note |
|---|---|---|---|---|---|---|---|
| `baseline` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 173 | bge query prefix, cosine top-4, no guard |
| `guarded` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 73 | baseline + groundedness guard (shipped default) |
| `gated_calibrated` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 158 | baseline + retrieval gate raised to the threshold the baseline data implies |
| `no_query_instruction` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.839 | 31 | ablation: bge asymmetric query prefix removed |
| `mmr_0.3` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 39 | ablation: MMR diversity |
| `k1_answers` (k=1) | 0.948 | 0.948 | 0.931 | 0.914 | 0.793 | 39 | ablation: cheapest possible context |
| `k8_answers` (k=8) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 39 | ablation: wide context |
| `closed_book` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 194 | control: model answers with no retrieved context |
| `ungated` (k=4) | 1.000 | 0.971 | 0.254 | 0.991 | 0.793 | 157 | ablation: no retrieval gate, prompt-only refusal |

### Retrieval on unanswerable questions (false-positive pressure)

| config | n | hit@k | mean top score |
|---|---|---|---|
| `baseline` | 10 | 0.000 | 0.603 |
| `guarded` | 10 | 0.000 | 0.603 |
| `gated_calibrated` | 10 | 0.000 | 0.603 |
| `no_query_instruction` | 10 | 0.000 | 0.653 |
| `mmr_0.3` | 10 | 0.000 | 0.603 |
| `k1_answers` | 10 | 0.000 | 0.603 |
| `k8_answers` | 10 | 0.000 | 0.603 |
| `closed_book` | 10 | 0.000 | 0.603 |
| `ungated` | 10 | 0.000 | 0.603 |

## Answers

`fact_recall` counts a refusal as a miss. `forbidden` = share of answers that emitted a plausible-but-wrong trap value. `claim support` = share of sentences whose numbers and entities appear in the passage they cite.

| config | mode | fact_recall | perfect | forbidden | claim support | citation cov | abstain acc | false answer | guarded | gen ms (mean) |
|---|---|---|---|---|---|---|---|---|---|---|
| `baseline` | rag | 0.902 | 0.875 | 0.036 | 0.909 | 0.964 | 0.600 | 0.400 | 0 | 40916 |
| `guarded` | rag | 0.741 | 0.714 | 0.022 | 1.000 | 0.978 | 0.600 | 0.400 | 10 | 16569 |
| `gated_calibrated` | rag | 0.812 | 0.786 | 0.020 | 0.897 | 0.949 | 1.000 | 0.000 | 0 | 21107 |
| `k1_answers` | rag | 0.732 | 0.714 | 0.000 | 0.871 | 0.977 | 0.800 | 0.200 | 0 | 9187 |
| `k8_answers` | rag | 0.955 | 0.929 | 0.052 | 0.950 | 0.911 | 0.400 | 0.600 | 0 | 71363 |
| `closed_book` | closed-book | 0.089 | 0.054 | 0.000 | 0.284 | 0.441 | 0.500 | 0.500 | 0 | 14912 |
| `ungated` | rag | 0.884 | 0.857 | 0.018 | 0.880 | 0.969 | 0.600 | 0.400 | 0 | 29020 |

## Can a similarity threshold separate answerable from unanswerable?

| group | min | p25 | median | mean | max |
|---|---|---|---|---|---|
| answerable | 0.592 | 0.767 | 0.798 | 0.793 | 0.919 |
| unanswerable | 0.523 | 0.549 | 0.600 | 0.603 | 0.703 |

Best single threshold on this test set: **0.7166** (balanced accuracy 0.966; keeps 93% of answerable questions, blocks 100% of unanswerable ones). Because the distributions overlap, a threshold alone cannot guarantee grounding - hence the post-hoc groundedness guard.

## Failures worth reading (`baseline`)

### `q01` How fast can a cat run?

- answer: A cat can travel at a top speed of approximately 31 mph [1] over a short distance.

Cats' heart beats nearly twice as fast as a human heart, at 110 to 140 beats a minute [2], which means they can pump blood at a rate of around 140-220 beats per minute.
- retrieved: ['c021', 'c079', 'c023', 'c025'] (top score 0.7496) | cited: [1, 2]
- unsupported claim: "Cats' heart beats nearly twice as fast as a human heart, at 110 to 140 beats a minute , which means they can pump blood at a rate of around 140-220 beats per minute." (numbers ['220'], entities [])

### `q06` How many different sounds do cats make compared with dogs?

- answer: Cats make about 100 different sounds [1].
Dogs make only about 10 different sounds [2].
Cats make 100 different sounds, while dogs make only 10 different sounds [1, 2].
- retrieved: ['c008', 'c020', 'c014', 'c062'] (top score 0.8481) | cited: [1, 2]
- unsupported claim: "Cats make 100 different sounds, while dogs make only 10 different sounds [1, 2]." (numbers ['1', '2'], entities [])

### `q16` What was the oldest cat on record and how old was she?

- answer: [1] The oldest cat on record was Crème Puff from Austin, Texas, who lived from 1967 to August 6, 2005, three days after her 38th birthday. [1]

[2] A cat called Dusty has the known record for the most kittens. She had more than 420 kittens in her lifetime. [2]

[3] The oldest cat
- retrieved: ['c066', 'c085', 'c092', 'c065'] (top score 0.7349) | cited: [1, 2, 3, 4]
- unsupported claim: "The oldest cat on record was Crème Puff from Austin, Texas, who lived from 1967 to August 6, 2005, three days after her 38th birthday." (numbers [], entities ['cr'])

### `q20` How many muscles control a cat's outer ear?

- answer: [1] Cats have 32 muscles that control the outer ear [1].

[2] A cat can independently rotate its ears 180 degrees [2].

[3] A cat's back is extremely flexible because it has up to 53 loosely fitting vertebrae [3].

[4] A cat usually has about 12 whiskers on each side of its face 
- retrieved: ['c062', 'c025', 'c055', 'c043'] (top score 0.8594) | cited: [1, 2, 3, 4]
- **fabricated trap values**: ['12']

### `q30` What is the richest cat?

- answer: I don't know from the given context. [1]
- retrieved: ['c094', 'c096', 'c085', 'c042'] (top score 0.6971) | cited: [1]
- missing required facts: ['blackie', '15']

### `q31` What is the most expensive cat ever bought?

- answer: The most expensive cat ever bought is Zeus, an Asian Leopard cat (ALC)-Domestic Shorthair (DSH) hybrid, who is 90% ALC and 10% DSH, and has an asking price of £100,000 ($154,000) [1].
- retrieved: ['c094', 'c042', 'c085', 'c065'] (top score 0.7773) | cited: [1]
- missing required facts: ['little nicky', '50,000']

### `q32` How many cats live in North America compared to dogs?

- answer: [1] There are 73 million cats compared to 63 million dogs in North America. [1]
[2] There are more than 500 million domestic cats in the world, with approximately 40 recognized breeds. [2]
[3] Approximately 40,000 people are bitten by cats in the U.S. annually. [4]
- retrieved: ['c014', 'c010', 'c008', 'c018'] (top score 0.8418) | cited: [1, 2, 3, 4]
- unsupported claim: "Approximately 40,000 people are bitten by cats in the U.S." (numbers [], entities ['s', 'u'])

### `q33` How many feral cats are there in the United States?

- answer: [1] There are up to 60 million feral cats in the United States alone. [1]

[2] There are 73 million cats compared to 63 million dogs. Over 30% of households in North America own a cat. [2]

[3] Approximately 40,000 people are bitten by cats in the U.S. annually. [3]

[4] There ar
- retrieved: ['c091', 'c014', 'c018', 'c010'] (top score 0.7968) | cited: [1, 2, 3, 4]
- **fabricated trap values**: ['500 million']
- unsupported claim: "Approximately 40,000 people are bitten by cats in the U.S." (numbers [], entities ['s', 'u'])

### `q36` What is the normal body temperature of a cat?

- answer: [1] The normal body temperature of a cat is between 100.5 ° and 102.5 °F. [1]

[2] A cat is sick if its temperature goes below 100 ° or above 103 °F. [1]

[3] In the 1930s, two Russian biologists discovered that color change in Siamese kittens depend on their body temperature. [3
- retrieved: ['c073', 'c076', 'c090', 'c074'] (top score 0.9189) | cited: [1, 2, 3, 4]
- unsupported claim: "The normal body temperature of a cat is between 100.5 ° and 102.5 °F." (numbers [], entities ['f'])
- unsupported claim: "A cat is sick if its temperature goes below 100 ° or above 103 °F." (numbers [], entities ['f'])
- unsupported claim: "The normal body temperature of a cat is between 100.5 ° and 102.5 °F." (numbers [], entities ['f'])

### `q39` What everyday items are poisonous for a cat to eat?

- answer: Onions, garlic, green tomatoes, raw potatoes, and chocolate are all poisonous to cats [1].
These foods can cause an upset stomach and gas in cats [1].
- retrieved: ['c077', 'c122', 'c123', 'c124'] (top score 0.7326) | cited: [1]
- missing required facts: ['tylenol']

### `q41` How long does a domestic cat typically live?

- answer: [1] A domestic cat typically lives for 14 years, according to the average life span of a domestic cat. [1]
[2] The oldest cat on record, Crème Puff, lived for 38 years, which is equivalent to about 96 human years. [2]
[3] On average, cats spend 2/3 of every day sleeping, which me
- retrieved: ['c117', 'c066', 'c001', 'c030'] (top score 0.8661) | cited: [1, 2, 3]
- missing required facts: ['15', '20']
- unsupported claim: "The oldest cat on record, Crème Puff, lived for 38 years, which is equivalent to about 96 human years." (numbers [], entities ['cr'])

### `q43` Can cats see colour?

- answer: Cats can see blue, green, and red, but not color as well as humans [1].
- retrieved: ['c106', 'c044', 'c133', 'c105'] (top score 0.8048) | cited: [1]
- missing required facts: ['colour']

### `q45` Besides the nose, how else do cats smell things?

- answer: Besides smelling with their nose, cats can also smell with an additional organ called the Jacobson's organ, located in the upper surface of the mouth. [1]

This organ is responsible for detecting pheromones, which are chemical signals that convey information between members of th
- retrieved: ['c149', 'c136', 'c024', 'c080'] (top score 0.7517) | cited: [1]
- unsupported claim: "Besides smelling with their nose, cats can also smell with an additional organ called the Jacobson's organ, located in the upper surface of the mouth ." (numbers [], entities ["jacobson'"])

### `q49` What did the two Siamese cats in the Russian embassy uncover?

- answer: The two Siamese cats uncovered microphones hidden by Russian spies in the Russian embassy in Moscow, Russia. [1]
- retrieved: ['c048', 'c133', 'c090', 'c038'] (top score 0.7253) | cited: [1]
- missing required facts: ['spy']

### `q51` How did ancient Egyptians mourn a dead family cat?

- answer: The ancient Egyptians mourned a dead family cat by shaving off their eyebrows, drinking wine, beating their breasts, and embalming the cat with a sculpted wooden mask [1].
- retrieved: ['c026', 'c141', 'c142', 'c027'] (top score 0.8184) | cited: [1]
- unsupported claim: "The ancient Egyptians mourned a dead family cat by shaving off their eyebrows, drinking wine, beating their breasts, and embalming the cat with a sculpted wooden mask ." (numbers [], entities ['egyptian'])

### `q52` What happened to cats during the Spanish Inquisition?

- answer: [1] During the time of the Spanish Inquisition, Pope Innocent VIII condemned cats as evil [1].

[2] Unfortunately, the widespread killing of cats led to an explosion of the rat population, which exacerbated the effects of the Black Death [2].

[3] Smuggling a cat out of ancient E
- retrieved: ['c012', 'c013', 'c029', 'c070'] (top score 0.798) | cited: [1, 2, 3]
- missing required facts: ['burned']

### `q53` What is the most expensive breed of cat by the record purchase price?

- answer: The most expensive breed of cat by the record purchase price is the Ragdoll, which has a price of £100,000 ($154,000) [1].
- retrieved: ['c094', 'c042', 'c086', 'c085'] (top score 0.7754) | cited: [1]
- unsupported claim: "The most expensive breed of cat by the record purchase price is the Ragdoll, which has a price of £100,000 ($154,000) ." (numbers [], entities ['ragdoll'])

### `q54` How many mice is one cat food meal equivalent to?

- answer: [1] The average cat food meal is the equivalent to about five mice. [1]
[2] Cats are North America's most popular pets: there are 73 million cats compared to 63 million dogs. Over 30% of households in North America own a cat. [2]
[3] Most cats give birth to a litter of between on
- retrieved: ['c125', 'c014', 'c028', 'c127'] (top score 0.8207) | cited: [1, 2, 3]
- unsupported claim: "Cats are North America's most popular pets: there are 73 million cats compared to 63 million dogs." (numbers [], entities ["america'"])

### `u01` How long does a cat's memory typically last?

- answer: A cat's memory typically lasts for about 96 human years, which is equivalent to 38 years for a cat. [1]
- retrieved: ['c066', 'c117', 'c001', 'c148'] (top score 0.7031) | cited: [1]
- **should have abstained**

### `u03` How much does a vet visit for a cat usually cost?

- answer: [1] A vet visit for a cat usually costs around £100,000 ($154,000), which is the asking price of the most expensive cat, Zeus, a 90% Asian Leopard cat (ALC)-Domestic Shorthair (DSH) hybrid. [1]

[2] A cat's average life span is 14 years, which is the average life span of a domest
- retrieved: ['c094', 'c042', 'c014', 'c117'] (top score 0.6463) | cited: [1, 2, 3]
- unsupported claim: "A cat's average life span is 14 years, which is the average life span of a domestic cat." (numbers ['14'], entities [])
- unsupported claim: "The cost of a cat's life is not explicitly stated, but the average life span of a domestic cat is 14 years." (numbers ['14'], entities [])
- **should have abstained**

### `u05` How do I train my cat to stop scratching the sofa?

- answer: To train your cat to stop scratching the sofa, you can try the following:

Cats are extremely sensitive to vibrations, [1] and may be more likely to scratch at objects that vibrate, such as a sofa. Cats are said to detect earthquake tremors 10 or 15 minutes before humans can, [2]
- retrieved: ['c114', 'c087', 'c054', 'c025'] (top score 0.5491) | cited: [1, 2, 3]
- **should have abstained**

### `u07` Do cats dream?

- answer: Cats do not dream in the same way that humans do, but they do experience different states of consciousness. [1]

Cats are not color blind, but they can see colors that are invisible to humans, such as blue, green, and red. [3]

Cats lack a true collarbone, which allows them to sq
- retrieved: ['c060', 'c148', 'c106', 'c111'] (top score 0.5971) | cited: [1, 3, 4]
- **should have abstained**

