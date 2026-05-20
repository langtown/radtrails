'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SupportPage() {
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would send to a backend
    console.log('Contact form submitted:', contactForm);
    setSubmitted(true);
    setContactForm({ name: '', email: '', message: '' });
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setContactForm((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#673de6] to-[#5025d1] py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h1 className="text-3xl md:text-5xl font-bold mb-6">
            Help us support our mission!
          </h1>
          <p className="text-xl text-[#ebe4ff]">
            You didn't come this far to stop
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-3 gap-12">
          {/* Donate Section */}
          <div className="md:col-span-1">
            <div className="bg-gray-50 rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Donate</h2>
              <p className="text-gray-700 mb-6 leading-relaxed">
                Your donation directly supports our mission to empower riders, build community, and advance mountain biking in Ventura County.
              </p>
              <a
                href="https://giv.li/90m43b"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold text-center transition-colors mb-4"
              >
                Give Now with Givelify
              </a>
              <p className="text-sm text-gray-600 text-center">
                Givelify is a secure, easy way to support nonprofits.
              </p>
            </div>

            {/* About Organization */}
            <div className="bg-blue-50 rounded-lg p-8 mt-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                About Ride and Develop
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Ride and Develop, Inc. is a non-profit dedicated to empowering individuals through mountain bike racing and outdoor recreation.
              </p>
              <div className="space-y-3 text-sm text-gray-700">
                <div>
                  <p className="font-semibold">Service Area</p>
                  <p>Conejo Valley and surrounding areas</p>
                </div>
                <div>
                  <p className="font-semibold">Focus</p>
                  <p>Youth development, competitive racing, trail stewardship, and community building</p>
                </div>
              </div>
            </div>
          </div>

          {/* Newsletter & Contact */}
          <div className="md:col-span-2 space-y-8">
            {/* Newsletter Section */}
            <div className="border-2 border-blue-200 rounded-lg p-8 bg-blue-50">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">
                Join Our Outdoor Community
              </h2>
              <p className="text-gray-700 mb-6 leading-relaxed">
                Stay updated on upcoming events, coaching programs, trail work opportunities, and community initiatives.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  console.log('Newsletter signup');
                }}
                className="space-y-4"
              >
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Subscribe to Our Newsletter
                </button>
              </form>
            </div>

            {/* Contact Section */}
            <div className="bg-gray-50 rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-900">
                Get in Touch
              </h2>

              <div className="space-y-6 mb-8">
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                    Email
                  </h3>
                  <a
                    href="mailto:bobby@radtrails.org"
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    bobby@radtrails.org
                  </a>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                    Phone
                  </h3>
                  <a
                    href="tel:805-358-9914"
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    805.358.9914
                  </a>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                    Location
                  </h3>
                  <address className="text-gray-700 not-italic">
                    936 Calle Tulipan
                    <br />
                    Thousand Oaks, CA 91360
                  </address>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
                    Hours
                  </h3>
                  <p className="text-gray-700">Monday–Friday</p>
                </div>
              </div>

              {/* Contact Form */}
              <form
                onSubmit={handleContactSubmit}
                className="border-t border-gray-200 pt-8 space-y-4"
              >
                <h3 className="font-bold text-gray-900 mb-4">
                  Send us a message
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={contactForm.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={contactForm.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    name="message"
                    value={contactForm.message}
                    onChange={handleInputChange}
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Send Message
                </button>

                {submitted && (
                  <p className="text-green-600 font-medium text-center">
                    Thank you for your message! We'll get back to you soon.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Ways to Support Section */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center text-gray-900">
            Ways to Support Ride and Develop
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-lg p-8 shadow-lg">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">💙</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">Donate</h3>
              <p className="text-gray-700 mb-4">
                Make a one-time or recurring donation to support our coaching programs, youth initiatives, and trail work.
              </p>
              <a
                href="https://giv.li/90m43b"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Donate Now →
              </a>
            </div>

            <div className="bg-white rounded-lg p-8 shadow-lg">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">🤝</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Volunteer
              </h3>
              <p className="text-gray-700 mb-4">
                Join our community trail work days, help at events, or mentor young riders. Contact us to get involved!
              </p>
              <a
                href="mailto:bobby@radtrails.org"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Get Involved →
              </a>
            </div>

            <div className="bg-white rounded-lg p-8 shadow-lg">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">📣</span>
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">Spread the Word</h3>
              <p className="text-gray-700 mb-4">
                Follow us on social media, share our programs with friends, and help us build a stronger mountain biking community.
              </p>
              <div className="flex gap-3">
                <a
                  href="https://www.facebook.com/rideandevelop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Facebook
                </a>
                <span className="text-gray-400">•</span>
                <a
                  href="https://www.instagram.com/rideandevelop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Instagram
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impact Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Your Impact Matters
          </h2>
          <p className="text-lg text-blue-100 mb-8 leading-relaxed">
            Every dollar supports coaching programs for youth, trail maintenance, competitive racing opportunities, and community building. Together, we're transforming lives through mountain biking.
          </p>
          <a
            href="https://giv.li/90m43b"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Make a Donation
          </a>
        </div>
      </section>
    </div>
  );
}
