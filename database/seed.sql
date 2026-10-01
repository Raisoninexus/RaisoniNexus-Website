INSERT INTO public.branches (name, short_name, description)
SELECT seed.name, seed.short_name, seed.description
FROM (
  VALUES
    ('Computer Science and Engineering - Computer Science', 'CSE CS', 'Computer science foundations, programming, algorithms and systems.'),
    ('Computer Science and Engineering - Data Science', 'CSE DS', 'Data science, statistics, machine learning and analytics.'),
    ('Computer Engineering', 'COE', 'Computer engineering, software systems and hardware foundations.'),
    ('Computer Science and Engineering - Artificial Intelligence', 'CSE AI', 'Artificial intelligence, intelligent systems and applied computing.'),
    ('Computer Science and Engineering - Artificial Intelligence and Machine Learning', 'CSE AIML', 'Artificial intelligence, machine learning and data-driven systems.'),
    ('Electrical Engineering', 'Electrical', 'Electrical power, circuits, machines and control systems.'),
    ('Electronics and Telecommunication Engineering', 'ENTC', 'Electronics, communication systems and signal processing.'),
    ('Civil Engineering', 'Civil', 'Civil engineering, structural design and infrastructure.'),
    ('Mechanical Engineering', 'Mechanical', 'Mechanical design, manufacturing and thermal engineering.')
) AS seed(name, short_name, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.branches existing
  WHERE lower(existing.short_name) = lower(seed.short_name)
);

INSERT INTO public.semesters (name, number)
SELECT 'Semester ' || semester_number, semester_number
FROM generate_series(1, 8) AS sequence(semester_number)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.semesters existing
  WHERE existing.number = semester_number
);
