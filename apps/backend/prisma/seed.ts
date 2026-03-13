import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Consumer
  const consumer = await prisma.user.upsert({
    where: { email: 'consumer@tapr.dev' },
    update: {},
    create: {
      email: 'consumer@tapr.dev',
      phone: '+61400000001',
      fullName: 'Alex Consumer',
      role: UserRole.consumer,
      avatarUrl: null,
    },
  });

  // Barber (level 3)
  const barberUser = await prisma.user.upsert({
    where: { email: 'barber@tapr.dev' },
    update: {},
    create: {
      email: 'barber@tapr.dev',
      phone: '+61400000002',
      fullName: 'Jordan Barber',
      role: UserRole.barber,
      avatarUrl: null,
      barberProfile: {
        create: {
          level: 3,
          title: 'Senior',
          totalVerifiedCuts: 280,
          averageRating: 4.7,
          totalRatings: 92,
          bio: 'Specialist in fades and textured cuts. 5 years experience.',
          abn: '12345678901',
          aqfCertLevel: 'cert_iii',
          serviceRadiusKm: 15,
          isSustainable: false,
        },
      },
    },
  });

  // Studio
  const studioUser = await prisma.user.upsert({
    where: { email: 'studio@tapr.dev' },
    update: {},
    create: {
      email: 'studio@tapr.dev',
      phone: '+61400000003',
      fullName: 'The Fade Factory',
      role: UserRole.studio,
      avatarUrl: null,
      studioProfile: {
        create: {
          businessName: 'The Fade Factory',
          abn: '98765432101',
          addressLine1: '42 George Street',
          suburb: 'Sydney',
          state: 'NSW',
          postcode: '2000',
          googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
          phone: '+61292000001',
          chairCount: 6,
          isVerified: true,
        },
      },
    },
  });

  console.log('Seeded users:');
  console.log(`  consumer: ${consumer.id} (${consumer.email})`);
  console.log(`  barber:   ${barberUser.id} (${barberUser.email})`);
  console.log(`  studio:   ${studioUser.id} (${studioUser.email})`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
