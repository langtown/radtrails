import Image from 'next/image';
import Link from 'next/link';

export default function ServicesPage() {
  const coaches = [
    {
      name: 'Bobby Langin',
      role: 'Head Coach & Founder',
      image: '/images/coaches/bobby-langin.jpg',
      credentials: [
        'USA Cycling Level 3 Coach',
        'PMBIA Level 1',
        'NICA Level 3 Instructor',
        'Former UCI Elite Downhill Racer',
      ],
      bio: 'Bobby founded Ride and Develop to share the transformative power of mountain biking. With decades of competitive racing experience and professional coaching credentials, he leads our team with passion and expertise.',
    },
    {
      name: 'Cam Scacheri',
      role: 'Cross-Country & Endurance Coach',
      image: '/images/coaches/cam-scacheri.jpg',
      credentials: [
        'Cross-country Specialist',
        'Enduro Coach',
        'Endurance Specialist',
        'Cyclocross Coach',
      ],
      bio: 'Cam brings specialized expertise in XC racing and long-distance riding. His comprehensive coaching helps athletes develop the fitness and skills needed for success across all disciplines.',
    },
    {
      name: 'Sully Notaro',
      role: 'Downhill & Technical Specialist',
      image: '/images/coaches/sully-notaro.jpg',
      credentials: [
        'Professional Downhill Racer',
        'Technical Skills Specialist',
        'Fundamentals Focus',
      ],
      bio: 'Sully, a professional downhill racer, focuses on building strong fundamentals and unlocking each athlete\'s potential. His technical expertise and competitive experience make him invaluable for riders pursuing downhill racing.',
    },
    {
      name: 'Donavon Hartman',
      role: 'Youth Programs Coach',
      image: '/images/coaches/donavon-hartman.png',
      credentials: [
        'Youth Development Specialist',
        'Racing Coach',
      ],
      bio: 'Donavon is dedicated to developing the next generation of mountain bikers. His passion for youth programs helps young riders build confidence and skills in a supportive environment.',
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#ebe4ff] to-[#f2f3f6] py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-6 text-[#1d1e20]">
            Services & Coaching
          </h1>
          <p className="text-xl text-[#727586]">
            Professional mountain bike coaching in Ventura County, Northern LA County, and Santa Cruz.
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <h2 className="text-3xl font-bold mb-12 text-center text-gray-900">
          Pricing
        </h2>

        <div className="space-y-12">
          {/* Private Lessons */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Private Lessons</h3>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-gray-600 mb-2">First 2 Hours</p>
                  <p className="text-3xl font-bold text-gray-900">$150</p>
                </div>
                <div>
                  <p className="text-gray-600 mb-2">Additional Hours</p>
                  <p className="text-3xl font-bold text-gray-900">$75/hr</p>
                </div>
              </div>
              <p className="text-gray-700 mt-4">
                One-on-one coaching tailored to your skill level and goals. Perfect for beginners through advanced riders.
              </p>
            </div>
          </div>

          {/* Group Lessons */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Group Lessons</h3>
              <p className="text-sm text-gray-600">Maximum 4 riders per group</p>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-3 gap-6 mb-4">
                <div>
                  <p className="text-gray-600 text-sm mb-2">2 Hours</p>
                  <p className="text-2xl font-bold text-gray-900">$150 + $100/person</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm mb-2">3 Hours</p>
                  <p className="text-2xl font-bold text-gray-900">$225 + $125/person</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm mb-2">4 Hours</p>
                  <p className="text-2xl font-bold text-gray-900">$300 + $125/person</p>
                </div>
              </div>
              <p className="text-gray-700">
                Build skills and confidence while learning alongside other riders.
              </p>
            </div>
          </div>

          {/* Training Programs */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Training Programs</h3>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6 mb-4">
                <div>
                  <p className="text-gray-600 mb-2">Race Season or Fitness Program</p>
                  <p className="text-3xl font-bold text-gray-900">$200</p>
                </div>
              </div>
              <p className="text-gray-700">
                Comprehensive multi-week training plans designed to prepare you for racing or improve overall fitness and skills.
              </p>
            </div>
          </div>

          {/* Guided Rides */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Guided Rides</h3>
              <p className="text-sm text-gray-600">Maximum 6 riders per guide</p>
            </div>
            <div className="p-6">
              <div className="grid md:grid-cols-2 gap-6 mb-4">
                <div>
                  <p className="text-gray-600 text-sm mb-2">2 Hours</p>
                  <p className="text-2xl font-bold text-gray-900">$150 + $50/person</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm mb-2">4 Hours</p>
                  <p className="text-2xl font-bold text-gray-900">$200 + $75/person</p>
                </div>
              </div>
              <p className="text-gray-700 mb-4">
                Explore local trails with expert guidance. Great for discovery and building community.
              </p>
              <p className="text-gray-700">
                Additional guide: $125–$160 per guide
              </p>
            </div>
          </div>

          {/* Clinics */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Clinics</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700">
                Specialized clinics on specific skills and techniques. Calendar coming soon. Check back regularly for announcements!
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/support"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Sign Up for Coaching
          </Link>
        </div>
      </section>

      {/* Coaches Section */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center text-gray-900">
            Meet Our Coaches
          </h2>

          <div className="grid md:grid-cols-2 gap-12">
            {coaches.map((coach) => (
              <div
                key={coach.name}
                className="bg-white rounded-lg overflow-hidden shadow-lg"
              >
                <div className="relative h-64 overflow-hidden">
                  <Image
                    src={coach.image}
                    alt={coach.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">
                    {coach.name}
                  </h3>
                  <p className="text-blue-600 font-semibold mb-4">
                    {coach.role}
                  </p>

                  <div className="mb-4">
                    <h4 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                      Credentials
                    </h4>
                    <ul className="space-y-1">
                      {coach.credentials.map((cred) => (
                        <li key={cred} className="text-sm text-gray-600">
                          ✓ {cred}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-gray-700 leading-relaxed">
                    {coach.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tagline Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            You didn't come this far to stop
          </h2>
          <p className="text-blue-100 mt-6 text-lg">
            Let's push your limits and achieve your goals together.
          </p>
        </div>
      </section>
    </div>
  );
}
