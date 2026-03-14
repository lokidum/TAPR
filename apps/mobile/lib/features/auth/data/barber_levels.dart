class BarberLevel {
  const BarberLevel({
    required this.level,
    required this.title,
    required this.description,
  });

  final int level;
  final String title;
  final String description;
}

const barberLevels = [
  BarberLevel(level: 1, title: 'Novice', description: 'Just getting started'),
  BarberLevel(level: 2, title: 'Rising', description: '50+ cuts, 4.0+ rating'),
  BarberLevel(level: 3, title: 'Senior', description: '250+ cuts, 4.5+ rating'),
  BarberLevel(level: 4, title: 'Expert', description: '1000+ cuts, 4.8+ rating'),
  BarberLevel(level: 5, title: 'Certified', description: 'Verified AQF cert'),
  BarberLevel(level: 6, title: 'Master', description: 'Admin verified elite'),
];
