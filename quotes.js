/* JANGE daily quote: a curated offline collection. Each entry is a documented
   quotation (source kept in `src`, not shown on screen) with a Nepali meaning.
   Popular misattributions were left out deliberately. The order is fixed and
   one entry is shown per Dubai calendar day, so nothing repeats until the whole
   collection has been seen. Translated works name the translator in `src`. */
(function (root) {
  'use strict';
  const QUOTES = [
    { q: 'Imagination is more important than knowledge.', a: 'Albert Einstein', ne: 'कल्पना ज्ञानभन्दा बढी महत्त्वपूर्ण छ।', src: 'Interview, The Saturday Evening Post, 26 Oct 1929' },
    { q: 'The unexamined life is not worth living.', a: 'Socrates', ne: 'आफ्नो जीवनको परीक्षण नगरी बाँचिने जीवन बाँच्न लायक हुँदैन।', src: 'Plato, Apology 38a' },
    { q: 'Where the mind is without fear and the head is held high.', a: 'Rabindranath Tagore', ne: 'जहाँ मन निर्भय हुन्छ र शिर उच्च रहन्छ।', src: 'Gitanjali, 35 (1912)' },
    { q: 'Well done is better than well said.', a: 'Benjamin Franklin', ne: 'राम्रोसँग भन्नुभन्दा राम्रोसँग गर्नु उत्तम हो।', src: 'Poor Richard’s Almanack, 1737' },
    { q: 'If I have seen further it is by standing on the shoulders of Giants.', a: 'Isaac Newton', ne: 'मैले अरूभन्दा टाढासम्म देखेको छु भने, त्यो महामानवहरूको काँधमा उभिएर हो।', src: 'Letter to Robert Hooke, 5 Feb 1675' },
    { q: 'Arise, awake, and stop not till the goal is reached.', a: 'Swami Vivekananda', ne: 'उठ, जाग, र लक्ष्यमा नपुगुन्जेल नरोक।', src: 'Complete Works, after the Katha Upanishad' },
    { q: 'Life can only be understood backwards; but it must be lived forwards.', a: 'Søren Kierkegaard', ne: 'जीवनलाई पछाडि फर्केर मात्र बुझ्न सकिन्छ, तर यसलाई अगाडि बढ्दै बाँच्नुपर्छ।', src: 'Journals, 1843' },
    { q: 'Education is the most powerful weapon which you can use to change the world.', a: 'Nelson Mandela', ne: 'शिक्षा संसार बदल्न प्रयोग गर्न सकिने सबैभन्दा शक्तिशाली हतियार हो।', src: 'Speech, Mindset Network launch, Johannesburg, 16 Jul 2003' },
    { q: 'The time is always right to do what is right.', a: 'Martin Luther King Jr.', ne: 'सही काम गर्ने समय सधैँ सही हुन्छ।', src: 'Speech, Oberlin College, 22 Oct 1964' },
    { q: 'Knowledge itself is power.', a: 'Francis Bacon', ne: 'ज्ञान आफैँमा शक्ति हो।', src: 'Meditationes Sacrae, 1597 (“ipsa scientia potestas est”)' },
    { q: 'Learning without thought is labour lost; thought without learning is perilous.', a: 'Confucius', ne: 'चिन्तनबिनाको अध्ययन व्यर्थ परिश्रम हो; अध्ययनबिनाको चिन्तन खतरनाक हुन्छ।', src: 'Analects 2.15, tr. James Legge' },
    { q: 'Not all those who wander are lost.', a: 'J. R. R. Tolkien', ne: 'घुमिरहने सबै जना बाटो बिराएका हुँदैनन्।', src: 'The Fellowship of the Ring, 1954' },
    { q: 'Try not to become a man of success, but rather try to become a man of value.', a: 'Albert Einstein', ne: 'सफल मानिस होइन, मूल्यवान् मानिस बन्ने प्रयास गर।', src: 'LIFE magazine, 2 May 1955' },
    { q: 'Lost time is never found again.', a: 'Benjamin Franklin', ne: 'गुमेको समय फेरि कहिल्यै फेला पर्दैन।', src: 'Poor Richard’s Almanack, 1748' },
    { q: 'Optimism is the faith that leads to achievement.', a: 'Helen Keller', ne: 'आशावाद त्यो विश्वास हो, जसले उपलब्धितर्फ डोऱ्याउँछ।', src: 'Optimism, 1903' },
    { q: 'The beginning is the most important part of any work.', a: 'Plato', ne: 'कुनै पनि कामको सबैभन्दा महत्त्वपूर्ण भाग त्यसको सुरुआत हो।', src: 'The Republic, Book II, tr. Benjamin Jowett' },
    { q: 'Courage is resistance to fear, mastery of fear—not absence of fear.', a: 'Mark Twain', ne: 'साहस भनेको डर नहुनु होइन; डरको प्रतिरोध गर्नु र डरमाथि नियन्त्रण राख्नु हो।', src: 'Pudd’nhead Wilson, 1894' },
    { q: 'Faith is the bird that feels the light and sings when the dawn is still dark.', a: 'Rabindranath Tagore', ne: 'आस्था त्यो चरा हो, जसले बिहानी अझै अँध्यारो हुँदा पनि उज्यालो महसुस गरी गीत गाउँछ।', src: 'Fireflies, 1928' },
    { q: 'Extraordinary claims require extraordinary evidence.', a: 'Carl Sagan', ne: 'असाधारण दाबीका लागि असाधारण प्रमाण चाहिन्छ।', src: 'Cosmos, episode 12, 1980' },
    { q: 'Waste no more time arguing about what a good man should be. Be one.', a: 'Marcus Aurelius', ne: 'असल मानिस कस्तो हुनुपर्छ भनेर बहस गर्दै समय खेर नफाल। आफैँ असल बन।', src: 'Meditations 10.16, tr. Gregory Hays' },
    { q: 'The only thing we have to fear is fear itself.', a: 'Franklin D. Roosevelt', ne: 'हामीले डराउनुपर्ने एउटै कुरा डर आफैँ हो।', src: 'First Inaugural Address, 4 Mar 1933' },
    { q: 'A journey of a thousand miles begins with a single step.', a: 'Laozi', ne: 'हजार माइलको यात्रा एउटै पाइलाबाट सुरु हुन्छ।', src: 'Tao Te Ching, ch. 64' },
    { q: 'The good life is one inspired by love and guided by knowledge.', a: 'Bertrand Russell', ne: 'असल जीवन त्यो हो, जुन प्रेमबाट प्रेरित र ज्ञानबाट निर्देशित हुन्छ।', src: 'What I Believe, 1925' },
    { q: 'I think, therefore I am.', a: 'René Descartes', ne: 'म सोच्छु, त्यसैले म छु।', src: 'Discourse on the Method, 1637' },
    { q: 'Strength does not come from physical capacity. It comes from an indomitable will.', a: 'Mahatma Gandhi', ne: 'शक्ति शारीरिक क्षमताबाट आउँदैन; यो अदम्य इच्छाशक्तिबाट आउँछ।', src: 'Young India, 11 Aug 1920' },
    { q: 'Hope is the thing with feathers / That perches in the soul.', a: 'Emily Dickinson', ne: 'आशा प्वाँख भएको त्यो चीज हो, जो आत्मामा आएर बस्छ।', src: 'Poem 254, c. 1861' },
    { q: 'It is not that we have a short space of time, but that we waste much of it.', a: 'Seneca', ne: 'हामीसँग समय कम भएको होइन, हामी त्यसको धेरै भाग खेर फाल्छौँ।', src: 'On the Shortness of Life, tr. John W. Basore' },
    { q: 'Look up at the stars and not down at your feet.', a: 'Stephen Hawking', ne: 'आफ्ना खुट्टातिर होइन, ताराहरूतिर माथि हेर।', src: 'London Paralympics opening ceremony, 29 Aug 2012' },
    { q: 'Our greatest glory is not in never falling, but in rising every time we fall.', a: 'Oliver Goldsmith', ne: 'हाम्रो सबैभन्दा ठूलो गौरव कहिल्यै नलड्नुमा होइन, हरेक पटक लडेपछि उठ्नुमा छ।', src: 'The Citizen of the World, 1762' },
    { q: 'He who has a why to live can bear almost any how.', a: 'Friedrich Nietzsche', ne: 'बाँच्ने कारण भएको मानिसले लगभग जस्तोसुकै परिस्थिति सहन सक्छ।', src: 'Twilight of the Idols, 1889 (as rendered by Viktor Frankl)' },
    { q: 'The important thing is not to stop questioning.', a: 'Albert Einstein', ne: 'महत्त्वपूर्ण कुरा प्रश्न सोध्न नछाड्नु हो।', src: 'LIFE magazine, 2 May 1955' },
    { q: 'Man is born free, and everywhere he is in chains.', a: 'Jean-Jacques Rousseau', ne: 'मानिस स्वतन्त्र जन्मन्छ, तर जताततै ऊ साङ्लोमा बाँधिएको छ।', src: 'The Social Contract, 1762' },
    { q: 'Injustice anywhere is a threat to justice everywhere.', a: 'Martin Luther King Jr.', ne: 'जहाँसुकै हुने अन्याय सबैतिरको न्यायका लागि खतरा हो।', src: 'Letter from Birmingham Jail, 16 Apr 1963' },
    { q: 'Nature, as we often say, makes nothing in vain.', a: 'Aristotle', ne: 'हामी प्रायः भन्ने गर्छौँ, प्रकृतिले कुनै पनि कुरा व्यर्थ बनाउँदैन।', src: 'Politics, Book I, tr. Benjamin Jowett' },
    { q: 'One never notices what has been done; one can only see what remains to be done.', a: 'Marie Curie', ne: 'गरिसकेको काम कसैको आँखामा पर्दैन; गर्न बाँकी काम मात्र देखिन्छ।', src: 'Letter to her brother Józef, 18 Mar 1894' },
    { q: 'The best way to predict the future is to invent it.', a: 'Alan Kay', ne: 'भविष्यको अनुमान गर्ने सबैभन्दा राम्रो उपाय त्यसलाई आविष्कार गर्नु हो।', src: 'Xerox PARC meeting, 1971' },
    { q: 'Life is either a daring adventure, or nothing.', a: 'Helen Keller', ne: 'जीवन या त साहसिक यात्रा हो, या केही पनि होइन।', src: 'Let Us Have Faith, 1940' },
    { q: 'He who knows other men is discerning; he who knows himself is intelligent.', a: 'Laozi', ne: 'अरूलाई चिन्ने व्यक्ति विवेकी हुन्छ; आफूलाई चिन्ने व्यक्ति बुद्धिमान् हुन्छ।', src: 'Tao Te Ching, ch. 33, tr. James Legge' },
    { q: 'I’m not afraid of storms, for I’m learning how to sail my ship.', a: 'Louisa May Alcott', ne: 'म आँधीसँग डराउँदिनँ, किनकि म आफ्नो जहाज चलाउन सिक्दै छु।', src: 'Little Women, 1868' },
    { q: 'Genius is one per cent inspiration and ninety-nine per cent perspiration.', a: 'Thomas Edison', ne: 'प्रतिभा एक प्रतिशत प्रेरणा र उनान्सय प्रतिशत परिश्रम हो।', src: 'As quoted in Harper’s Monthly Magazine, Sept 1932' },
    { q: 'The cosmos is also within us. We’re made of star-stuff.', a: 'Carl Sagan', ne: 'ब्रह्माण्ड हामीभित्र पनि छ। हामी ताराहरूकै तत्त्वबाट बनेका छौँ।', src: 'Cosmos, episode 1, 1980' },
    { q: 'If it is not right, do not do it: if it is not true, do not say it.', a: 'Marcus Aurelius', ne: 'सही छैन भने नगर; सत्य छैन भने नभन।', src: 'Meditations 12.17, tr. George Long' },
    { q: 'A man who dares to waste one hour of time has not discovered the value of life.', a: 'Charles Darwin', ne: 'एक घण्टा समय खेर फाल्ने आँट गर्ने मानिसले जीवनको मूल्य बुझेकै छैन।', src: 'Letter to his sister Susan Darwin, 1836' },
    { q: 'With malice toward none, with charity for all.', a: 'Abraham Lincoln', ne: 'कसैप्रति द्वेष नराखी, सबैप्रति उदारता राख्दै।', src: 'Second Inaugural Address, 4 Mar 1865' },
    { q: 'Wonder is the feeling of a philosopher, and philosophy begins in wonder.', a: 'Socrates', ne: 'आश्चर्य दार्शनिकको अनुभूति हो, र दर्शनको सुरुआत आश्चर्यबाटै हुन्छ।', src: 'Plato, Theaetetus 155d, tr. Benjamin Jowett' },
    { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs', ne: 'उत्कृष्ट काम गर्ने एउटै उपाय, आफूले गर्ने कामलाई माया गर्नु हो।', src: 'Stanford commencement address, 12 Jun 2005' },
    { q: 'We suffer more often in imagination than in reality.', a: 'Seneca', ne: 'हामी वास्तविकताभन्दा कल्पनामा बढी पटक दुःख पाउँछौँ।', src: 'Moral Letters to Lucilius, 13' },
    { q: 'Truth is ever to be found in simplicity, and not in the multiplicity and confusion of things.', a: 'Isaac Newton', ne: 'सत्य सधैँ सरलतामा भेटिन्छ, कुराहरूको बहुलता र अलमलमा होइन।', src: 'Manuscript on interpreting prophecy, Yahuda MS 1' },
    { q: 'That’s one small step for a man, one giant leap for mankind.', a: 'Neil Armstrong', ne: 'यो एक मानिसका लागि सानो पाइला हो, तर मानवजातिका लागि ठूलो फड्को।', src: 'Apollo 11, 20 Jul 1969' },
    { q: 'The weak can never forgive. Forgiveness is the attribute of the strong.', a: 'Mahatma Gandhi', ne: 'कमजोरले कहिल्यै क्षमा गर्न सक्दैन। क्षमा बलियोको गुण हो।', src: 'Young India, 2 Apr 1931' },
    { q: 'What is now proved was once only imagined.', a: 'William Blake', ne: 'आज प्रमाणित भएको कुरा कुनै बेला कल्पना मात्र थियो।', src: 'The Marriage of Heaven and Hell, c. 1790' },
    { q: 'The arc of the moral universe is long, but it bends toward justice.', a: 'Martin Luther King Jr.', ne: 'नैतिक ब्रह्माण्डको चाप लामो हुन्छ, तर त्यो न्यायतर्फ नै झुक्छ।', src: 'Speech, Montgomery, 25 Mar 1965' },
    { q: 'A thing of beauty is a joy for ever.', a: 'John Keats', ne: 'सुन्दर वस्तु सधैँका लागि आनन्द हो।', src: 'Endymion, 1818' },
    { q: 'In three words I can sum up everything I’ve learned about life: it goes on.', a: 'Robert Frost', ne: 'जीवनबारे मैले सिकेका सबै कुरा तीन शब्दमा भन्न सक्छु: यो अघि बढिरहन्छ।', src: 'Interview with Ray Josephs, 1954' },
    { q: 'This above all: to thine own self be true.', a: 'William Shakespeare', ne: 'सबैभन्दा माथि यो: आफैँप्रति सच्चा रहू।', src: 'Hamlet, Act I, Scene 3' },
    { q: 'Life is like riding a bicycle. To keep your balance you must keep moving.', a: 'Albert Einstein', ne: 'जीवन साइकल चलाउनुजस्तै हो। सन्तुलन राख्न निरन्तर अघि बढिरहनुपर्छ।', src: 'Letter to his son Eduard, 5 Feb 1930' },
    { q: 'In the midst of winter, I found there was, within me, an invincible summer.', a: 'Albert Camus', ne: 'जाडोको बीचमा मैले थाहा पाएँ, मभित्र कहिल्यै नहार्ने एउटा गर्मी छ।', src: 'Return to Tipasa, 1952 (tr.)' },
    { q: 'Experience is the name every one gives to their mistakes.', a: 'Oscar Wilde', ne: 'सबैले आफ्ना गल्तीहरूलाई दिने नाम नै अनुभव हो।', src: 'Lady Windermere’s Fan, 1892' },
    { q: 'The roots of education are bitter, but the fruit is sweet.', a: 'Aristotle', ne: 'शिक्षाका जरा तीता हुन्छन्, तर त्यसको फल मीठो हुन्छ।', src: 'Diogenes Laërtius, Lives of Eminent Philosophers V.18' },
    { q: 'Give me a place to stand, and I will move the earth.', a: 'Archimedes', ne: 'मलाई उभिने ठाउँ देऊ, म पृथ्वीलाई सारिदिन्छु।', src: 'As reported by Pappus of Alexandria, Synagoge VIII' },
  ];
  const EPOCH = Date.UTC(2026, 0, 1);
  // One entry per calendar day (a Dubai date key "YYYY-MM-DD"), stepping through
  // the fixed order so no quote repeats until all have been shown.
  function forDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    const day = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5);
    const index = ((day % QUOTES.length) + QUOTES.length) % QUOTES.length;
    return { ...QUOTES[index], index };
  }
  const api = { QUOTES, forDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JangeQuotes = api;
})(typeof window === 'undefined' ? globalThis : window);
