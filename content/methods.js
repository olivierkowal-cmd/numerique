/* Studio — fiches méthodes d'apprentissage (Studio.content.methods) */
window.Studio = window.Studio || {};
Studio.content = Studio.content || {};
(function () {
  Studio.content.methods = [
    {
      id: 'repetition-espacee',
      titre: 'La répétition espacée',
      emoji: '⏰',
      resume: 'Revoir une notion de plus en plus tard, juste avant de l’oublier.',
      pourquoi: 'On oublie ce qu’on ne revoit pas. Chaque révision bien placée aide à garder l’info plus longtemps. Un peu chaque jour marche mieux qu’une grosse séance la veille. Tes cartes Studio font ça pour toi.',
      etapes: [
        'Apprends la notion une première fois, sans pression.',
        'Revois-la demain, puis dans quelques jours, puis dans une semaine.',
        'Tu te trompes ? Reviens à un délai court. Tu réussis ? Attends plus longtemps.',
        'Note tes révisions dans ton agenda, ou laisse Studio les calculer.'
      ],
      exemple: 'Tu apprends le vocabulaire d’anglais lundi. Tu le revois mardi, vendredi, puis la semaine suivante. Le jour du contrôle, les mots sont encore là.',
      duree: '5 à 10 min par jour',
      niveau: 'Facile'
    },
    {
      id: 'rappel-actif',
      titre: 'Le rappel actif',
      emoji: '🧠',
      resume: 'Chercher la réponse dans ta tête, au lieu de relire.',
      pourquoi: 'Quand tu relis, tout te paraît connu. Tu crois savoir, mais ce n’est pas sûr. Chercher la réponse demande un effort. Et cet effort aide ta mémoire. Si c’est un peu dur, c’est bon signe.',
      etapes: [
        'Lis ton cours une fois, avec attention.',
        'Ferme ton cahier. Écris tout ce dont tu te souviens.',
        'Rouvre ton cours et compare. Entoure ce que tu as oublié.',
        'Recommence en travaillant surtout les trous.'
      ],
      exemple: 'Après ton chapitre de sciences, tu écris de mémoire les étapes de la digestion. Tu vérifies, puis tu revois les deux étapes oubliées.',
      duree: '10 à 20 min',
      niveau: 'Facile'
    },
    {
      id: 'feynman',
      titre: 'La technique de Feynman',
      emoji: '🗣️',
      resume: 'Explique la notion avec des mots simples, comme à un ami.',
      pourquoi: 'Tu n’arrives pas à expliquer simplement ? Alors un point reste flou. Expliquer te montre où tu bloques. Cette méthode porte le nom du physicien Richard Feynman.',
      etapes: [
        'Choisis une notion. Écris son nom en haut d’une page.',
        'Explique-la à voix haute ou par écrit, avec des mots simples.',
        'Repère les endroits où tu hésites.',
        'Retourne au cours pour ces points. Puis explique à nouveau.'
      ],
      exemple: 'Tu expliques la photosynthèse à ton petit frère : « La plante fabrique sa nourriture avec la lumière, l’eau et le gaz carbonique. » Tu bloques sur la chlorophylle ? Tu sais quoi revoir.',
      duree: '10 à 15 min',
      niveau: 'Moyen'
    },
    {
      id: 'palais-memoire',
      titre: 'Le palais de la mémoire',
      emoji: '🏰',
      resume: 'Poser ce que tu dois retenir dans les pièces d’un lieu que tu connais.',
      pourquoi: 'Ton cerveau retient bien les lieux et les images. Tu ranges des infos le long d’un trajet connu. Ensuite, tu refais le trajet dans ta tête et tu les retrouves dans l’ordre. Cette astuce existe depuis l’Antiquité.',
      etapes: [
        'Choisis un lieu que tu connais par cœur : ta chambre, ton trajet vers l’école.',
        'Fixe 5 à 10 étapes, toujours dans le même ordre.',
        'Transforme chaque info en image drôle ou bizarre. Pose-la à une étape.',
        'Refais le trajet dans ta tête pour retrouver les infos.'
      ],
      exemple: 'Pour le cycle de l’eau : une flaque qui s’évapore sur ton lit, un nuage dans ton armoire, de la pluie sur ton bureau, une rivière dans le couloir.',
      duree: '15 min pour le construire',
      niveau: 'Moyen'
    },
    {
      id: 'acronymes',
      titre: 'Acronymes et acrostiches',
      emoji: '🔤',
      resume: 'Garder les initiales d’une liste pour en faire un mot ou une phrase.',
      pourquoi: 'Retenir une liste dans l’ordre, c’est difficile. Un mot ou une phrase, c’est plus simple. Chaque lettre te rappelle un élément de la liste.',
      etapes: [
        'Écris ta liste. Souligne la première lettre de chaque élément.',
        'Essaie de former un mot avec ces lettres. C’est un acronyme.',
        'Ça ne marche pas ? Invente une phrase avec ces lettres. C’est un acrostiche.',
        'Apprends ton mot ou ta phrase. Vérifie que tu retrouves toute la liste.'
      ],
      exemple: 'Pour les planètes, invente une phrase avec M, V, T, M, J, S, U, N. Par exemple : « Mon Vélo Traverse Maintenant Jolis Sentiers Un Nuage ». La tienne sera encore plus facile à retenir.',
      duree: '5 min',
      niveau: 'Facile'
    },
    {
      id: 'chunking',
      titre: 'Le découpage en blocs',
      emoji: '🧩',
      resume: 'Ranger les infos en petits paquets, au lieu de tout apprendre d’un coup.',
      pourquoi: 'Ta mémoire ne garde que peu d’éléments à la fois. Un paquet de plusieurs infos compte comme un seul élément. C’est donc plus facile à retenir.',
      etapes: [
        'Parcours le chapitre. Repère les grandes idées.',
        'Fais 3 à 5 paquets. Donne un titre court à chacun.',
        'Apprends un paquet à la fois.',
        'À la fin, redis les titres, puis le contenu de chaque paquet.'
      ],
      exemple: 'Un numéro de téléphone se retient mieux par paires de chiffres. Pour un chapitre d’histoire, fais trois blocs : les causes, les événements, les conséquences.',
      duree: '10 à 15 min',
      niveau: 'Facile'
    },
    {
      id: 'cartes-mentales',
      titre: 'Les cartes mentales',
      emoji: '🕸️',
      resume: 'Dessiner ton cours comme un arbre : une idée au centre, des branches autour.',
      pourquoi: 'Une carte mentale montre les liens entre les idées. Pour la faire, tu dois comprendre et trier. Tu ne fais pas que recopier.',
      etapes: [
        'Écris le thème au centre d’une feuille.',
        'Trace une branche par grande idée, avec un mot-clé.',
        'Ajoute des sous-branches, des couleurs et de petits dessins.',
        'Refais-la de mémoire quelques jours plus tard.'
      ],
      exemple: 'Au centre : « Le volcan ». Branches : les parties, les types d’éruption, les dangers, où on en trouve. Chaque branche a ses petits détails.',
      duree: '15 à 20 min',
      niveau: 'Facile'
    },
    {
      id: 'pomodoro',
      titre: 'La méthode Pomodoro',
      emoji: '🍅',
      resume: 'Travailler par petites tranches, avec de vraies pauses.',
      pourquoi: 'Rester concentré longtemps, c’est dur. Une courte tranche suivie d’une pause aide à démarrer. Les durées sont des repères. Adapte-les à toi.',
      etapes: [
        'Choisis une seule tâche.',
        'Mets un minuteur sur 25 minutes. Garde ton téléphone loin.',
        'Pause de 5 minutes : lève-toi, bois de l’eau, étire-toi.',
        'Après 4 tranches, fais une longue pause.'
      ],
      exemple: 'Pour ton devoir de maths : 25 minutes d’exercices, 5 minutes de pause, puis 25 minutes pour corriger.',
      duree: '25 min + 5 min de pause',
      niveau: 'Facile'
    },
    {
      id: 'entrelacement',
      titre: 'L’entrelacement',
      emoji: '🔀',
      resume: 'Mélanger plusieurs sujets dans une même séance.',
      pourquoi: 'Vingt exercices du même type, et tu appliques la recette sans réfléchir. En mélangeant, tu dois choisir la bonne méthode à chaque fois. C’est plus dur sur le moment. Mais c’est utile en contrôle, où tout est mélangé.',
      etapes: [
        'Choisis 2 ou 3 sujets, par exemple fractions, pourcentages, géométrie.',
        'Alterne-les par petites séries.',
        'Avant chaque exercice, demande-toi : quelle méthode ici ?',
        'Note les exercices où tu te trompes. Reviens-y plus tard.'
      ],
      exemple: 'Au lieu de 15 exercices de fractions, fais-en 5 de fractions, 5 de pourcentages, 5 de géométrie. Puis recommence un tour.',
      duree: '30 à 45 min',
      niveau: 'Moyen'
    },
    {
      id: 'cornell',
      titre: 'La méthode Cornell',
      emoji: '📝',
      resume: 'Une façon d’organiser tes notes pour les réviser facilement.',
      pourquoi: 'Ta page est découpée en zones. Tes notes sont donc prêtes à réviser. Les questions de la marge te servent à t’interroger.',
      etapes: [
        'Divise ta page : une grande colonne à droite, une marge à gauche, un bandeau en bas.',
        'Pendant le cours, écris tes notes dans la grande colonne.',
        'Après le cours, écris des mots-clés ou des questions dans la marge.',
        'En bas, résume la page en 2 phrases. Pour réviser, cache la colonne de droite.'
      ],
      exemple: 'Dans la marge : « Quels sont les trois états de l’eau ? ». Dans la colonne : la réponse. En bas : un petit résumé.',
      duree: '10 min après chaque cours',
      niveau: 'Moyen'
    },
    {
      id: 'double-codage',
      titre: 'Le double codage',
      emoji: '🎨',
      resume: 'Associer des mots à des images, des schémas ou des dessins.',
      pourquoi: 'Mots et images donnent deux chemins à ton cerveau pour retrouver l’info. Un petit schéma vaut souvent mieux qu’un long paragraphe. Pas besoin de bien dessiner. Un croquis suffit.',
      etapes: [
        'Lis un passage. Repère l’idée principale.',
        'Fais un schéma, un petit dessin ou un tableau.',
        'Ajoute quelques mots-clés autour.',
        'Plus tard, regarde ton dessin et explique-le à voix haute.'
      ],
      exemple: 'Pour l’histoire : une frise avec un petit dessin par date importante. Un château fort pour le Moyen Âge, une pyramide pour l’Égypte.',
      duree: '10 à 15 min',
      niveau: 'Facile'
    },
    {
      id: 'rimes',
      titre: 'Les rimes et les chansons',
      emoji: '🎵',
      resume: 'Transformer une info en petite rime ou en chanson.',
      pourquoi: 'Le rythme et la rime restent en tête. Tu connais sûrement des comptines depuis toujours ! Pratique pour les règles et les formules.',
      etapes: [
        'Repère la règle ou l’info à retenir.',
        'Cherche des mots qui riment avec les mots importants.',
        'Écris deux ou quatre vers courts, qui sonnent bien à voix haute.',
        'Répète-les, ou mets-les sur un air connu.'
      ],
      exemple: 'Le classique « Trente jours ont novembre, avril, juin et septembre » aide à retenir la longueur des mois.',
      duree: '5 à 10 min',
      niveau: 'Facile'
    },
    {
      id: 'storytelling',
      titre: 'L’histoire inventée',
      emoji: '📖',
      resume: 'Relier les infos dans une histoire avec des personnages.',
      pourquoi: 'On retient mieux une histoire qu’une liste de faits. L’histoire donne un fil à suivre. Chaque moment t’aide à retrouver le suivant.',
      etapes: [
        'Liste les éléments à retenir, dans l’ordre.',
        'Invente un récit. Chaque élément devient un personnage, un lieu ou un événement.',
        'Rends-le drôle ou surprenant.',
        'Raconte-le à voix haute. Retrouve ensuite les éléments du cours.'
      ],
      exemple: 'Pour une réaction chimique, imagine une fête. Les invités arrivent, se mélangent, et de nouveaux groupes se forment.',
      duree: '10 à 15 min',
      niveau: 'Moyen'
    },
    {
      id: 'auto-quiz',
      titre: 'L’auto-quiz',
      emoji: '❓',
      resume: 'Te poser toi-même des questions, comme ferait ton prof.',
      pourquoi: 'Se tester, c’est l’un des meilleurs moyens de réviser. Tu vois vite ce que tu sais. Et ce qu’il reste à revoir. Les flashcards de Studio le font pour toi.',
      etapes: [
        'Après ta lecture, écris 10 questions : définitions, dates, pourquoi, comment.',
        'Attends un peu. Puis réponds sans regarder ton cours.',
        'Corrige-toi. Marque les questions ratées.',
        'Refais les cartes quelques jours plus tard, surtout celles que tu as ratées.'
      ],
      exemple: 'Après ton chapitre d’histoire : « Que s’est-il passé en 1492 ? », « Pourquoi Christophe Colomb est-il parti vers l’ouest ? ».',
      duree: '10 à 20 min',
      niveau: 'Facile'
    },
    {
      id: 'planning-revision',
      titre: 'Un planning réaliste',
      emoji: '📅',
      resume: 'Répartir tes révisions sur plusieurs jours avant le contrôle.',
      pourquoi: 'Tout réviser au dernier moment fatigue. Quelques séances courtes sur la semaine, c’est plus efficace. Et c’est moins stressant.',
      etapes: [
        'Note la date du contrôle et les chapitres à réviser.',
        'Compte les jours libres. Répartis les chapitres. Garde la veille pour un survol.',
        'Prévois des séances courtes, avec des pauses et du temps libre.',
        'Coche chaque séance faite. Du retard ? Ajuste, sans te décourager.'
      ],
      exemple: 'Contrôle de sciences samedi : lundi, chapitre 1. Mardi, chapitre 2. Mercredi, chapitre 3. Jeudi, cartes. Vendredi, relecture légère.',
      duree: '10 min pour le préparer',
      niveau: 'Facile'
    }
  ];
})();
