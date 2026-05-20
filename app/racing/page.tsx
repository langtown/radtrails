import Image from 'next/image';
import Link from 'next/link';

export default function RacingPage() {
  const athletes = [
    {
      name: 'Kyle Johnson',
      image: '/images/athletes/kyle-johnson.jpeg',
      bio: 'Podium in two of three SoCal League races. Dedicated racer with strong cross-country credentials.',
    },
    {
      name: 'Jeremy Rowell',
      image: '/images/athletes/jeremy-rowell.jpg',
      bio: 'High school senior, 3-year U.S. National Championships participant. Rising star in the junior racing circuit.',
    },
    {
      name: 'Mia Morris',
      image: '/images/athletes/mia-morris.jpg',
      bio: 'Senior focused on inspiring girls in mountain biking. Dedicated to advancing women in the sport.',
    },
    {
      name: 'Sullivan Hartman',
      image: '/images/athletes/sullivan-hartman.jpg',
      bio: '15-year-old who reached podium despite injury in first race. Demonstrates resilience and determination.',
    },
    {
      name: 'Matt',
      image: '/images/athletes/matt.jpg',
      bio: 'Committed racer pushing limits in competitive mountain bike racing.',
    },
    {
      name: 'Max',
      image: '/images/athletes/max.jpeg',
      bio: 'Talented rider developing racing skills and racing competitively.',
    },
    {
      name: 'Tyler',
      image: '/images/athletes/tyler.jpeg',
      bio: 'Dedicated athlete excelling in cross-country and enduro disciplines.',
    },
    {
      name: 'Jonny',
      image: '/images/athletes/jonny.png',
      bio: 'Passionate rider committed to competitive racing and skill development.',
    },
  ];

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#673de6] to-[#5025d1] py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-6 text-white">
            Empowering Outdoor Experiences Through Mountain Biking
          </h1>
          <p className="text-lg md:text-xl text-gray-200">
            Join Langtown Racing Academy and experience the thrill of competitive racing.
          </p>
        </div>
      </section>

      {/* Bobby Langin Section */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-3 gap-8 items-center mb-16">
          <div className="relative h-80 md:h-96 rounded-lg overflow-hidden">
            <Image
              src="/images/athletes/bobby-langin.jpg"
              alt="Bobby Langin"
              fill
              className="object-cover"
            />
          </div>

          <div className="md:col-span-2">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">
              Bobby Langin
            </h2>
            <p className="text-lg text-blue-600 font-semibold mb-6">
              Head Coach & Founder
            </p>

            <div className="space-y-4 text-gray-700">
              <p className="leading-relaxed">
                Bobby Langin is the founder of Ride and Develop and Head Coach of Langtown Racing Academy. His journey in competitive racing began at an early age—he started riding bikes at age 3 and competing in motocross at age 4.
              </p>

              <p className="leading-relaxed">
                Throughout his career, Bobby competed at the highest levels, including UCI Elite and Pro levels in downhill mountain biking. His competitive experience combined with professional coaching credentials makes him uniquely qualified to guide the next generation of riders.
              </p>

              <div className="bg-gray-50 p-4 rounded-lg mt-6">
                <h3 className="font-bold text-gray-900 mb-3">Credentials</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>✓ USA Cycling Level 3 Coach</li>
                  <li>✓ PMBIA Level 1 Certified</li>
                  <li>✓ NICA Level 3 Instructor</li>
                  <li>✓ Former UCI Elite Downhill Racer</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Athletes Section */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4 text-center text-gray-900">
            Our Racing Team
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Meet the talented athletes of Langtown Racing Academy. These dedicated riders represent the spirit of mountain biking racing and the power of competitive sports to transform lives.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {athletes.map((athlete) => (
              <div
                key={athlete.name}
                className="bg-white rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="relative h-56 overflow-hidden bg-gray-200">
                  <Image
                    src={athlete.image}
                    alt={athlete.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {athlete.name}
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {athlete.bio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Langtown Legacy Section */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <h2 className="text-3xl font-bold mb-12 text-center text-gray-900">
          Langtown Racing Academy Legacy
        </h2>

        <div className="space-y-12">
          {/* History */}
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="relative h-80 rounded-lg overflow-hidden">
              <Image
                src="/images/athletes/lt-vintage.jpg"
                alt="Langtown vintage"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                A Decades-Long Tradition
              </h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Langtown Racing started back in 1984 as a backyard motocross track that grew into a community event and training ground for riders of all ages. What began as a family passion has evolved into a world-class racing program.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Today, Langtown Racing Academy continues that tradition, building on over 40 years of experience to develop confident, skilled, and purpose-driven mountain bikers. Our athletes represent not just competitive excellence, but the values of resilience, community, and personal growth that Langtown has always embodied.
              </p>
            </div>
          </div>

          {/* Legacy Images Gallery */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="relative h-64 rounded-lg overflow-hidden">
              <Image
                src="/images/athletes/lt-justina.jpg"
                alt="Langtown legacy"
                fill
                className="object-cover"
              />
            </div>
            <div className="relative h-64 rounded-lg overflow-hidden">
              <Image
                src="/images/athletes/lt-turn2.jpg"
                alt="Langtown legacy"
                fill
                className="object-cover"
              />
            </div>
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg h-64 flex items-center justify-center p-6">
              <div className="text-center text-white">
                <h4 className="text-2xl font-bold mb-4">
                  40+ Years of Racing Excellence
                </h4>
                <p className="text-blue-100">
                  From backyard motocross to elite mountain biking—building champions and building character.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
            Ready to Join the Team?
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Learn about our coaching and racing programs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/services"
              className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition-colors inline-block"
            >
              View Coaching Programs
            </Link>
            <Link
              href="/support"
              className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 rounded-lg font-semibold transition-colors inline-block"
            >
              Get in Touch
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Info */}
      <section className="bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-gray-600">
          <p>
            Located in Thousand Oaks, CA 91360 | Hours: Monday–Friday
          </p>
          <p className="mt-2">
            <a href="tel:805-358-9914" className="text-blue-600 hover:text-blue-700">
              805.358.9914
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
