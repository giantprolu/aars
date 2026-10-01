# Prompts photo des plats (Nano Banana)

Une photo par plat du catalogue, à générer dans Gemini (Nano Banana), puis à
envoyer avec `npm run upload:photos -w @nutri/web -- <dossier>` (voir README).

## Mode d'emploi

1. Coller le **style commun** une fois, en début de conversation dans Gemini,
   puis envoyer le prompt de chaque plat. Rester dans la même conversation
   aide à garder le même style d'une photo à l'autre.
2. Télécharger l'image. Gemini ajoute une petite étoile en filigrane dans un
   coin : la recadrer avant l'envoi (le plat étant centré, rien ne se perd).
3. Renommer le fichier exactement comme le titre du plat (`<slug>.png`) et
   le ranger dans un même dossier avec les autres.
4. Lancer l'envoi. Les fichiers mal nommés sont signalés et ignorés ; on peut
   relancer autant de fois que nécessaire, une photo remplace la précédente.

L'app recadre la photo en carré (vignette), en bandeau large (fiche du plat)
et à 4:3 environ (cartes) : d'où l'exigence d'un plat centré avec de la marge.

## Style commun

> Pour toutes les images qui suivent : photographie culinaire réaliste, comme
> pour un livre de recettes du quotidien. Plat fait maison, appétissant sans
> artifice, portion réaliste. Vue de trois quarts légèrement plongeante,
> lumière naturelle douce venant de la gauche, faible profondeur de champ.
> Vaisselle en céramique mate blanc cassé, sur une table en bois clair ou un
> linge en lin beige clair. Format paysage 4:3, plat bien centré avec de la
> marge tout autour : rien d'important près des bords. Aucun texte, aucune
> main, aucun logo, pas de couverts au premier plan, pas d'ingrédient posé à
> côté du plat. Les ingrédients cités doivent être reconnaissables.

## Perte de poids (40 plats)

### `lose-avoine-fruits-rouges.png`

> Avoine froide, fromage blanc et fruits rouges (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, fromage blanc 0 %, framboises, myrtilles, amandes.

### `lose-omelette-champignons-epinards.png`

> Omelette aux champignons et épinards (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : œufs, champignons de Paris, épinards, pain de campagne.

### `lose-porridge-pomme-cannelle.png`

> Porridge pomme-cannelle (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, pomme, cannelle.

### `lose-yaourt-grec-kiwi.png`

> Yaourt grec, kiwi et amandes (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : yaourt grec nature, kiwis, amandes.

### `lose-pain-oeufs-avocat.png`

> Tartine d’œufs durs et avocat (petit-déjeuner), sur une assiette plate. On y reconnaît : pain de campagne, œufs, avocat, tomate.

### `lose-poulet-quinoa-courgettes.png`

> Poulet, quinoa et courgettes au citron (déjeuner), dans une assiette. On y reconnaît : filets de poulet, quinoa, courgettes.

### `lose-salade-thon-haricots-blancs.png`

> Salade de thon et haricots blancs (déjeuner), dans une assiette. On y reconnaît : thon au naturel, haricots blancs, tomates, oignon rouge.

### `lose-bowl-pois-chiches-patate-douce.png`

> Bowl pois chiches et patate douce (déjeuner), dans une assiette. On y reconnaît : pois chiches, patates douces, épinards, feta.

### `lose-cabillaud-riz-complet.png`

> Cabillaud vapeur, riz complet et haricots verts (déjeuner), dans une assiette. On y reconnaît : dos de cabillaud, riz complet, haricots verts.

### `lose-salade-lentilles-oeuf.png`

> Salade de lentilles, œuf dur et crudités (déjeuner), dans une assiette. On y reconnaît : lentilles vertes, œufs, carottes, concombre, tomates.

### `lose-wok-dinde-legumes.png`

> Wok de dinde et légumes croquants (déjeuner), dans une assiette. On y reconnaît : escalopes de dinde, poivrons, brocolis, champignons de Paris, riz basmati.

### `lose-poulet-ratatouille.png`

> Poulet rôti et ratatouille (déjeuner), dans une assiette. On y reconnaît : cuisses de poulet, aubergines, courgettes, tomates pelées, oignon, pommes de terre.

### `lose-taboule-chou-fleur-poulet.png`

> Taboulé de chou-fleur au poulet (déjeuner), dans une assiette. On y reconnaît : chou-fleur, filets de poulet, pois chiches, tomates, concombre.

### `lose-soupe-legumes-dinde.png`

> Soupe de légumes et blanc de dinde (dîner), dans un bol ou une assiette creuse. On y reconnaît : poireaux, carottes, céleri-rave, blanc de dinde, pommes de terre.

### `lose-saumon-papillote-brocolis.png`

> Saumon en papillote et brocolis (dîner), dans une assiette. On y reconnaît : pavés de saumon, brocolis, riz basmati.

### `lose-crevettes-ail-courgettes.png`

> Crevettes à l’ail et courgettes (dîner), dans une assiette. On y reconnaît : crevettes, courgettes, boulgour, ail.

### `lose-curry-lentilles-corail.png`

> Curry de lentilles corail aux épinards (dîner), dans un bol ou une assiette creuse. On y reconnaît : lentilles corail, épinards, riz basmati, oignon, curry en poudre.

### `lose-gratin-chou-fleur-jambon.png`

> Gratin de chou-fleur au jambon (dîner), dans une assiette. On y reconnaît : chou-fleur, jambon blanc, pommes de terre, emmental râpé.

### `lose-tofu-legumes-verts.png`

> Tofu sauté aux légumes verts (dîner), dans une assiette. On y reconnaît : tofu nature, haricots verts, brocolis, graines de sésame.

### `lose-colin-puree-celeri.png`

> Colin et purée de céleri (dîner), dans une assiette. On y reconnaît : filets de colin, céleri-rave, pommes de terre.

### `lose-steak-hache-haricots-verts.png`

> Steak haché 5 % et haricots verts (dîner), dans une assiette. On y reconnaît : steaks hachés 5 %, haricots verts, pommes de terre, oignon.

### `lose-fromage-blanc-amandes.png`

> Fromage blanc, amandes et cannelle (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : fromage blanc 0 %, amandes, cannelle.

### `lose-pomme-beurre-cacahuete.png`

> Pomme et beurre de cacahuète (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : pomme, beurre de cacahuète.

### `lose-oeufs-durs-carottes.png`

> Œufs durs et bâtonnets de carotte (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : œufs, carottes.

### `lose-fromage-blanc-poire-noix.png`

> Fromage blanc, poire et noix (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : fromage blanc 0 %, poire, flocons d’avoine, noix.

### `lose-oeufs-brouilles-tomates.png`

> Œufs brouillés, tomates et pain complet (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : œufs, tomates, pain complet.

### `lose-tartine-saumon-concombre.png`

> Tartine de fromage frais, saumon fumé et concombre (petit-déjeuner), sur une assiette plate. On y reconnaît : pain de campagne, fromage blanc 3 %, saumon fumé, concombre.

### `lose-salade-nicoise.png`

> Salade niçoise allégée (déjeuner), dans une assiette. On y reconnaît : thon au naturel, œufs durs, haricots verts, tomates, pommes de terre.

### `lose-bowl-saumon-riz-concombre.png`

> Bowl de saumon, riz et concombre (déjeuner), dans une assiette. On y reconnaît : pavé de saumon, riz basmati, concombre, carotte, graines de sésame.

### `lose-dinde-champignons-riz-complet.png`

> Poêlée de dinde, champignons et riz complet (déjeuner), dans une assiette. On y reconnaît : escalopes de dinde, champignons de Paris, riz complet, oignon.

### `lose-salade-pois-chiches-feta.png`

> Salade de pois chiches, concombre et feta (déjeuner), dans une assiette. On y reconnaît : pois chiches, concombre, tomates, feta, oignon rouge.

### `lose-poulet-boulgour-tomates.png`

> Poulet, boulgour et tomates rôties (déjeuner), dans une assiette. On y reconnaît : filets de poulet, boulgour, tomates.

### `lose-omelette-courgettes.png`

> Omelette aux courgettes et salade verte (dîner), dans une assiette. On y reconnaît : œufs, courgettes, salade verte, emmental râpé.

### `lose-cabillaud-tomates-poivrons.png`

> Cabillaud à la tomate et aux poivrons (dîner), dans une assiette. On y reconnaît : dos de cabillaud, tomates pelées, poivrons, oignon, riz basmati.

### `lose-poulet-curry-chou-fleur.png`

> Poulet au curry et chou-fleur rôti (dîner), dans un bol ou une assiette creuse. On y reconnaît : filets de poulet, chou-fleur, yaourt grec, curry en poudre.

### `lose-boeuf-brocolis-soja.png`

> Bœuf haché, brocolis et sauce soja (dîner), dans une assiette. On y reconnaît : bœuf haché 5 %, brocolis, riz complet, sauce soja.

### `lose-truite-poireaux-papillote.png`

> Truite en papillote et poireaux (dîner), dans une assiette. On y reconnaît : filets de truite, poireaux, pommes de terre.

### `lose-fromage-blanc-myrtilles.png`

> Fromage blanc 0 % et myrtilles (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : fromage blanc 0 %, myrtilles.

### `lose-orange-cajou.png`

> Orange et noix de cajou (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : orange, noix de cajou.

### `lose-legumes-houmous.png`

> Bâtonnets de légumes et houmous (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : carotte, concombre, houmous.

## Maintien (40 plats)

### `maintain-porridge-banane-cacahuete.png`

> Porridge banane et beurre de cacahuète (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, banane, beurre de cacahuète.

### `maintain-tartines-oeufs-avocat.png`

> Tartines d’œufs brouillés et avocat (petit-déjeuner), sur une assiette plate. On y reconnaît : pain de campagne, œufs, avocat, tomate.

### `maintain-bol-yaourt-granola.png`

> Bol de yaourt grec, avoine grillée et fraises (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : yaourt grec nature, flocons d’avoine, cerneaux de noix, fraises.

### `maintain-pancakes-avoine.png`

> Pancakes à l’avoine et au fromage blanc (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, œufs, fromage blanc 3 %, banane.

### `maintain-pain-jambon-fromage-blanc.png`

> Pain, jambon et fromage blanc (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : pain de campagne, jambon blanc, fromage blanc 3 %, orange.

### `maintain-poulet-riz-poivrons.png`

> Poulet, riz basmati et poivrons (déjeuner), dans une assiette. On y reconnaît : filets de poulet, riz basmati, poivrons, oignon.

### `maintain-pates-thon-tomates.png`

> Pâtes au thon et tomates (déjeuner), dans une assiette. On y reconnaît : pâtes complètes, thon au naturel, tomates pelées, parmesan.

### `maintain-chili-boeuf-haricots.png`

> Chili de bœuf aux haricots rouges (déjeuner), dans un bol ou une assiette creuse. On y reconnaît : bœuf haché 5 %, haricots rouges, tomates pelées, poivrons, riz blanc.

### `maintain-salade-quinoa-feta.png`

> Salade de quinoa, pois chiches et feta (déjeuner), dans une assiette. On y reconnaît : quinoa, pois chiches, feta, concombre, tomates.

### `maintain-saumon-pommes-terre.png`

> Saumon, pommes de terre et haricots verts (déjeuner), dans une assiette. On y reconnaît : pavés de saumon, pommes de terre, haricots verts.

### `maintain-boulgour-dinde-legumes.png`

> Boulgour, dinde et légumes rôtis (déjeuner), dans une assiette. On y reconnaît : escalopes de dinde, boulgour, courgettes, aubergines.

### `maintain-omelette-pommes-terre.png`

> Omelette aux pommes de terre (déjeuner), dans une assiette. On y reconnaît : œufs, pommes de terre, emmental râpé, oignon, salade verte.

### `maintain-curry-poulet-coco.png`

> Curry de poulet au lait de coco (déjeuner), dans un bol ou une assiette creuse. On y reconnaît : cuisses de poulet, lait de coco, riz basmati, poivrons, oignon, curry en poudre.

### `maintain-gratin-courgettes-jambon.png`

> Gratin de courgettes au jambon (dîner), dans une assiette. On y reconnaît : courgettes, jambon blanc, riz blanc, emmental râpé.

### `maintain-truite-semoule-legumes.png`

> Truite, semoule et légumes (dîner), dans une assiette. On y reconnaît : filets de truite, semoule, courgettes, carottes.

### `maintain-soupe-lentilles-lardons.png`

> Soupe de lentilles aux lardons (dîner), dans un bol ou une assiette creuse. On y reconnaît : lentilles vertes, lardons fumés, poireaux, carottes, pain de campagne.

### `maintain-tofu-nouilles-legumes.png`

> Tofu sauté, nouilles et brocolis (dîner), dans une assiette. On y reconnaît : tofu nature, pâtes complètes, brocolis, graines de sésame.

### `maintain-cabillaud-ecrase-pommes-terre.png`

> Cabillaud et écrasé de pommes de terre (dîner), dans une assiette. On y reconnaît : dos de cabillaud, pommes de terre, épinards.

### `maintain-poivrons-farcis.png`

> Poivrons farcis au bœuf et au riz (dîner), dans une assiette. On y reconnaît : bœuf haché 5 %, poivrons, riz blanc, tomates pelées, emmental râpé.

### `maintain-frittata-legumes-feta.png`

> Frittata aux légumes et à la feta (dîner), dans une assiette. On y reconnaît : œufs, pommes de terre, feta, épinards.

### `maintain-wok-crevettes-riz.png`

> Wok de crevettes, riz et petits pois (dîner), dans une assiette. On y reconnaît : crevettes, riz basmati, petits pois, poivrons.

### `maintain-yaourt-noix-miel.png`

> Yaourt grec, noix et miel (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : yaourt grec nature, cerneaux de noix, miel.

### `maintain-banane-amandes.png`

> Banane et amandes (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : banane, amandes.

### `maintain-tartine-fromage-blanc-miel.png`

> Tartine de fromage blanc au miel (collation), sur une assiette plate. On y reconnaît : pain de campagne, fromage blanc 3 %, miel.

### `maintain-muesli-lait-pomme.png`

> Muesli maison, lait et pomme (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, raisins secs, noix, lait demi-écrémé, pomme.

### `maintain-oeufs-plat-pain-complet.png`

> Œufs au plat, jambon et pain complet (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : œufs, pain complet, jambon blanc, tomate.

### `maintain-pain-perdu-fraises.png`

> Pain perdu à la cannelle et fraises (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : pain de campagne, œuf, fraises, cannelle.

### `maintain-salade-pates-poulet-pesto.png`

> Salade de pâtes au poulet et pesto (déjeuner), dans une assiette. On y reconnaît : pâtes, filets de poulet, tomates, pesto, parmesan, salade verte.

### `maintain-hachis-parmentier.png`

> Hachis parmentier (déjeuner), dans une assiette. On y reconnaît : bœuf haché 5 %, pommes de terre, oignon, emmental râpé.

### `maintain-risotto-champignons.png`

> Risotto aux champignons et petits pois (déjeuner), dans une assiette. On y reconnaît : riz, champignons de Paris, petits pois, oignon, parmesan.

### `maintain-filet-mignon-moutarde.png`

> Filet mignon à la moutarde, riz et haricots verts (déjeuner), dans une assiette. On y reconnaît : filet mignon de porc, riz basmati, haricots verts, moutarde.

### `maintain-saumon-patate-douce-epinards.png`

> Saumon, patate douce et épinards (déjeuner), dans une assiette. On y reconnaît : pavé de saumon, patate douce, épinards.

### `maintain-aubergines-farcies-boeuf.png`

> Aubergines farcies au bœuf et semoule (dîner), dans une assiette. On y reconnaît : aubergines, bœuf haché 5 %, tomates pelées, oignon, emmental râpé, semoule.

### `maintain-curry-pois-chiches-coco.png`

> Curry de pois chiches au lait de coco (dîner), dans un bol ou une assiette creuse. On y reconnaît : pois chiches, lait de coco, tomates pelées, épinards, oignon, curry en poudre, riz basmati.

### `maintain-poulet-basquaise.png`

> Poulet basquaise et riz (dîner), dans une assiette. On y reconnaît : cuisses de poulet, poivrons, tomates pelées, oignon, riz.

### `maintain-croque-monsieur-salade.png`

> Croque-monsieur et salade verte (dîner), sur une assiette plate. On y reconnaît : pain de mie, jambon blanc, emmental râpé, salade verte.

### `maintain-colin-quinoa-legumes.png`

> Colin, quinoa et légumes rôtis à la feta (dîner), dans une assiette. On y reconnaît : filets de colin, quinoa, courgettes, poivrons, feta.

### `maintain-smoothie-fraise-banane.png`

> Smoothie fraise, banane et avoine (collation), dans un grand verre. On y reconnaît : banane, fraises, flocons d’avoine.

### `maintain-mini-sandwich-jambon.png`

> Petit sandwich jambon-emmental (collation), sur une assiette plate. On y reconnaît : pain de campagne, jambon blanc, emmental râpé.

### `maintain-amandes-raisins-chocolat.png`

> Amandes, raisins secs et chocolat noir (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : amandes, raisins secs, chocolat noir 70 %.

## Prise de masse (40 plats)

### `gain-porridge-banane-noix.png`

> Porridge complet banane et cacahuète (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, banane.

### `gain-oeufs-avocat-pain.png`

> Œufs brouillés, avocat et pain grillé (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : œufs, pain de campagne, avocat, emmental râpé.

### `gain-bowl-yaourt-fruits-secs.png`

> Bol de yaourt grec, avoine et fruits secs (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : yaourt grec nature, flocons d’avoine, amandes, raisins secs.

### `gain-pancakes-avoine-banane.png`

> Pancakes avoine et banane (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, œufs, banane.

### `gain-tartines-saumon-fume.png`

> Tartines au saumon fumé et avocat (petit-déjeuner), sur une assiette plate. On y reconnaît : pain de campagne, saumon fumé, fromage blanc 3 %, avocat.

### `gain-poulet-riz-complet-avocat.png`

> Poulet, riz complet et avocat (déjeuner), dans une assiette. On y reconnaît : filets de poulet, riz complet, avocat, poivrons.

### `gain-pates-boeuf-parmesan.png`

> Pâtes au bœuf et parmesan (déjeuner), dans une assiette. On y reconnaît : pâtes complètes, bœuf haché 5 %, tomates pelées, parmesan.

### `gain-chili-boeuf-riz.png`

> Chili de bœuf, haricots rouges et riz (déjeuner), dans un bol ou une assiette creuse. On y reconnaît : bœuf haché 5 %, haricots rouges, riz blanc, tomates pelées, emmental râpé.

### `gain-saumon-quinoa-feta.png`

> Saumon, quinoa et brocolis à la feta (déjeuner), dans une assiette. On y reconnaît : pavés de saumon, quinoa, brocolis, feta.

### `gain-couscous-poulet-pois-chiches.png`

> Couscous poulet et pois chiches (déjeuner), dans une assiette. On y reconnaît : cuisses de poulet, semoule, pois chiches, carottes, courgettes.

### `gain-bowl-boeuf-patate-douce.png`

> Bowl bœuf, patate douce et noix de cajou (déjeuner), dans une assiette. On y reconnaît : bœuf haché 5 %, patates douces, épinards, avocat, noix de cajou.

### `gain-gratin-pates-thon.png`

> Gratin de pâtes au thon (déjeuner), dans une assiette. On y reconnaît : pâtes complètes, thon au naturel, emmental râpé, tomates pelées.

### `gain-porc-pommes-de-terre.png`

> Filet mignon, pommes de terre et haricots verts (déjeuner), dans une assiette. On y reconnaît : filet mignon de porc, pommes de terre, haricots verts.

### `gain-risotto-poulet-parmesan.png`

> Risotto de poulet aux champignons (dîner), dans une assiette. On y reconnaît : riz blanc, filets de poulet, parmesan, champignons de Paris.

### `gain-gratin-dauphinois-jambon.png`

> Gratin de pommes de terre au jambon (dîner), dans une assiette. On y reconnaît : pommes de terre, emmental râpé, jambon blanc.

### `gain-curry-poulet-riz-complet.png`

> Curry de poulet, coco et riz complet (dîner), dans un bol ou une assiette creuse. On y reconnaît : cuisses de poulet, riz complet, poivrons, oignon, curry en poudre.

### `gain-saumon-pates-epinards.png`

> Pâtes crémeuses au saumon et épinards (dîner), dans une assiette. On y reconnaît : pavés de saumon, pâtes complètes, crème épaisse, épinards, parmesan.

### `gain-burger-maison-patate-douce.png`

> Burger maison et frites de patate douce (dîner), sur une assiette plate. On y reconnaît : steaks hachés 5 %, pain de campagne, emmental râpé, patates douces.

### `gain-omelette-lardons-pommes-terre.png`

> Omelette aux lardons et pommes de terre (dîner), dans une assiette. On y reconnaît : œufs, pommes de terre, lardons fumés, emmental râpé, pain de campagne.

### `gain-tofu-nouilles-cacahuete.png`

> Nouilles au tofu, sauce cacahuète (dîner), dans une assiette. On y reconnaît : tofu nature, pâtes complètes, brocolis, graines de sésame.

### `gain-chili-vegetarien-avocat.png`

> Chili végétarien à l’avocat (dîner), dans un bol ou une assiette creuse. On y reconnaît : haricots rouges, pois chiches, riz complet, avocat, tomates pelées.

### `gain-shake-banane-cacahuete.png`

> Shake banane et cacahuète (collation), dans un grand verre. On y reconnaît : banane, flocons d’avoine.

### `gain-tartines-cacahuete-miel.png`

> Tartines cacahuète, miel et banane (collation), sur une assiette plate. On y reconnaît : pain de campagne, miel, banane.

### `gain-yaourt-noix-chocolat.png`

> Yaourt grec, noix et chocolat noir (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : yaourt grec nature, cerneaux de noix, chocolat noir 70 %.

### `gain-omelette-jambon-tartines.png`

> Omelette jambon-fromage et tartines beurrées (petit-déjeuner), sur une assiette plate. On y reconnaît : œufs, jambon blanc, emmental râpé, pain de campagne, beurre, orange.

### `gain-porridge-chocolat-banane.png`

> Porridge chocolat, banane et cacahuète (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : flocons d’avoine, banane, chocolat noir 70 %.

### `gain-pain-perdu-fromage-blanc.png`

> Pain perdu, fromage blanc et framboises (petit-déjeuner), dans un bol ou sur une assiette de petit-déjeuner. On y reconnaît : pain de campagne, œufs, fromage blanc 3 %, framboises.

### `gain-burrito-bowl-boeuf.png`

> Burrito bowl bœuf, riz et haricots rouges (déjeuner), dans une assiette. On y reconnaît : bœuf haché 5 %, riz, haricots rouges, avocat, tomates, emmental râpé.

### `gain-poulet-pates-champignons.png`

> Poulet et pâtes à la crème de champignons (déjeuner), dans une assiette. On y reconnaît : filets de poulet, pâtes, champignons de Paris, crème fraîche épaisse, parmesan.

### `gain-dinde-semoule-orientale.png`

> Dinde, semoule et pois chiches à l’orientale (déjeuner), dans une assiette. On y reconnaît : escalopes de dinde, semoule, pois chiches, courgettes, raisins secs, amandes.

### `gain-wok-boeuf-nouilles.png`

> Wok de bœuf, nouilles et poivrons (déjeuner), dans une assiette. On y reconnaît : bœuf haché 5 %, nouilles, poivrons, oignon, noix de cajou.

### `gain-salade-riz-thon-mais.png`

> Salade de riz au thon, maïs et œufs (déjeuner), dans une assiette. On y reconnaît : riz, thon au naturel, maïs doux, œufs durs, tomates.

### `gain-spaghetti-bolognaise.png`

> Spaghetti bolognaise (dîner), dans une assiette. On y reconnaît : spaghetti, bœuf haché 5 %, tomates pelées, oignon, parmesan.

### `gain-pates-carbonara.png`

> Pâtes carbonara (dîner), dans une assiette. On y reconnaît : pâtes, lardons fumés, œufs, parmesan.

### `gain-riz-cantonais-poulet.png`

> Riz cantonais au poulet (dîner), dans une assiette. On y reconnaît : riz, filets de poulet, œufs, petits pois, jambon blanc.

### `gain-gratin-patate-douce-poulet.png`

> Gratin de patate douce au poulet (dîner), dans une assiette. On y reconnaît : patate douce, poulet rôti, épinards, emmental râpé.

### `gain-dahl-lentilles-corail.png`

> Dahl de lentilles corail et riz basmati (dîner), dans un bol ou une assiette creuse. On y reconnaît : lentilles corail, riz basmati, tomates pelées, oignon, noix de cajou.

### `gain-fromage-blanc-avoine-noix.png`

> Fromage blanc, avoine, miel et noix (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : fromage blanc 3 %, flocons d’avoine, miel, noix.

### `gain-sandwich-thon-oeuf.png`

> Sandwich thon et œuf (collation), sur une assiette plate. On y reconnaît : pain de campagne, thon au naturel, œuf dur.

### `gain-mix-fruits-secs-banane.png`

> Fruits secs, chocolat noir et banane (collation), en portion individuelle, dans une coupelle ou sur une planchette. On y reconnaît : amandes, noix de cajou, raisins secs, chocolat noir 70 %, banane.
