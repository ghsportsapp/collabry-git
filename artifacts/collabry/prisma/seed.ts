import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

async function main() {

  // 1. FOLLOWER SLABS
  const slabs = [
    { label: 'Nano',  minFollowers: 1000,    maxFollowers: 9999,   recReelMin: 200,  recReelMax: 500,  recStoryMin: 100, recStoryMax: 200, recPostMin: 150, recPostMax: 350,  displayOrder: 1 },
    { label: 'Micro', minFollowers: 10000,   maxFollowers: 49999,  recReelMin: 500,  recReelMax: 1000, recStoryMin: 200, recStoryMax: 400, recPostMin: 350, recPostMax: 700,  displayOrder: 2 },
    { label: 'Mid',   minFollowers: 50000,   maxFollowers: 199999, recReelMin: 1000, recReelMax: 3000, recStoryMin: 400, recStoryMax: 800, recPostMin: 700, recPostMax: 2000, displayOrder: 3 },
    { label: 'Macro', minFollowers: 200000,  maxFollowers: 999999, recReelMin: 3000, recReelMax: 8000, recStoryMin: 800, recStoryMax: 2000, recPostMin: 2000, recPostMax: 5000, displayOrder: 4 },
    { label: 'Mega',  minFollowers: 1000000, maxFollowers: null,   recReelMin: 8000, recReelMax: 50000, recStoryMin: 2000, recStoryMax: 15000, recPostMin: 5000, recPostMax: 30000, displayOrder: 5 },
  ]
  for (const slab of slabs) {
    await prisma.followerSlab.upsert({ where: { label: slab.label }, update: slab, create: slab })
  }

  // 2. SCORING WEIGHTS
  const weights = [
    { parameter: 'category',     fullMatchPts: 31, partialMatchPts: 23, noMatchPts: 4,  relatedPts: 11 },
    { parameter: 'goal',         fullMatchPts: 16, partialMatchPts: 9,  noMatchPts: 3,  relatedPts: null },
    { parameter: 'gender',       fullMatchPts: 16, partialMatchPts: 8,  noMatchPts: 3,  relatedPts: null },
    { parameter: 'age',          fullMatchPts: 12, partialMatchPts: 6,  noMatchPts: 2,  relatedPts: null },
    { parameter: 'customerType', fullMatchPts: 10, partialMatchPts: 6,  noMatchPts: 3,  relatedPts: null },
    { parameter: 'location',     fullMatchPts: 7,  partialMatchPts: 3,  noMatchPts: 2,  relatedPts: null },
    { parameter: 'priceFit',     fullMatchPts: 4,  partialMatchPts: 2,  noMatchPts: 1,  relatedPts: null },
    { parameter: 'purchaseType', fullMatchPts: 4,  partialMatchPts: 2,  noMatchPts: 1,  relatedPts: null },
  ]
  for (const w of weights) {
    await prisma.scoringWeight.upsert({ where: { parameter: w.parameter }, update: w, create: w })
  }

  // 3. LOCATION ADJACENCY
  const locationAdj = [
    { locationA: 'URBAN',      locationB: 'SEMI_URBAN', pts: 3 },
    { locationA: 'SEMI_URBAN', locationB: 'URBAN',      pts: 3 },
    { locationA: 'RURAL',      locationB: 'SEMI_URBAN', pts: 3 },
    { locationA: 'SEMI_URBAN', locationB: 'RURAL',      pts: 3 },
  ]
  for (const adj of locationAdj) {
    await prisma.locationAdjacency.upsert({
      where: { locationA_locationB: { locationA: adj.locationA, locationB: adj.locationB } },
      update: adj,
      create: adj,
    })
  }

  // 4. CATEGORIES AND SUBCATEGORIES
  const categories = [
    { name: 'Fashion',   displayOrder: 1,  subs: ['Streetwear', 'Ethnic Wear', 'Accessories'] },
    { name: 'Fitness',   displayOrder: 2,  subs: ['Weight Loss', 'Gym & Bodybuilding', 'Yoga'] },
    { name: 'Food',      displayOrder: 3,  subs: ['Home Cooking', 'Restaurant Reviews', 'Healthy Eating'] },
    { name: 'Tech',      displayOrder: 4,  subs: ['Gadget Reviews', 'Gaming', 'Software'] },
    { name: 'Travel',    displayOrder: 5,  subs: ['Domestic Travel', 'International Travel', 'Budget Travel'] },
    { name: 'Beauty',    displayOrder: 6,  subs: ['Skincare', 'Makeup', 'Haircare'] },
    { name: 'Health',    displayOrder: 7,  subs: ['Nutrition', 'Mental Health', 'Wellness'] },
    { name: 'Finance',   displayOrder: 8,  subs: ['Personal Finance', 'Investing', 'Crypto'] },
    { name: 'Education', displayOrder: 9,  subs: ['Study Tips', 'Career Advice', 'Skill Development'] },
    { name: 'Lifestyle', displayOrder: 10, subs: ['Home Decor', 'Pets', 'Relationships'] },
  ]
  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { name: cat.name },
      update: { displayOrder: cat.displayOrder },
      create: { name: cat.name, displayOrder: cat.displayOrder },
    })
    for (let i = 0; i < cat.subs.length; i++) {
      await prisma.subcategory.upsert({
        where: { categoryId_name: { categoryId: created.id, name: cat.subs[i] } },
        update: { displayOrder: i + 1 },
        create: { categoryId: created.id, name: cat.subs[i], displayOrder: i + 1 },
      })
    }
  }

  // 5. FUN QUESTIONS (MCQ)
  const questions = [
    { text: "What's your content style?",        order: 1, options: ['Educational', 'Entertaining', 'Inspirational', 'Funny'] },
    { text: 'Best time to post?',                order: 2, options: ['Morning', 'Afternoon', 'Evening', 'Night'] },
    { text: 'Your audience is mostly?',           order: 3, options: ['Students', 'Working Professionals', 'Parents', 'Mixed'] },
    { text: 'What type of brands do you prefer?', order: 4, options: ['Fashion & Lifestyle', 'Food & Beverage', 'Tech & Gadgets', 'Health & Wellness'] },
    { text: 'How often do you post?',             order: 5, options: ['Daily', '3-4 times a week', 'Once a week', 'Occasionally'] },
  ]
  for (const q of questions) {
    const existing = await prisma.funQuestion.findFirst({ where: { questionText: q.text } })
    if (!existing) {
      const created = await prisma.funQuestion.create({ data: { questionText: q.text, displayOrder: q.order } })
      for (let i = 0; i < q.options.length; i++) {
        await prisma.funQuestionOption.create({ data: { questionId: created.id, optionText: q.options[i], displayOrder: i + 1 } })
      }
    }
  }

  // 6. INFORMATION MESSAGES
  const messages = [
    { formStep: 'creator_instagram',  messageText: 'Connect your Instagram account. Your handle and follower count will be auto-filled from Instagram.' },
    { formStep: 'creator_basic_info', messageText: 'Enter your real name and date of birth. You must be at least 14 years old to join.' },
    { formStep: 'creator_categories', messageText: 'Select up to 3 categories that best describe your content. Choose 1 subcategory per category.' },
    { formStep: 'creator_audience',   messageText: 'Find your audience data in Instagram Insights → Audience. Gender split must add up to 100%.' },
    { formStep: 'creator_pricing',    messageText: 'Set your price range for reels, stories, and posts. All three are required. You can see recommended ranges for your follower count.' },
    { formStep: 'creator_portfolio',  messageText: 'Add at least 3 of your best video URLs (YouTube, Instagram Reels, or Google Drive links). Check the self-declaration box for each.' },
    { formStep: 'creator_profile',    messageText: 'Upload a clear profile photo and write a short bio about yourself (max 150 characters).' },
    { formStep: 'brand_signup',       messageText: 'Enter your business details. Your brand logo will appear on campaigns and your profile.' },
  ]
  for (const msg of messages) {
    await prisma.informationMessage.upsert({
      where: { formStep: msg.formStep },
      update: { messageText: msg.messageText },
      create: { formStep: msg.formStep, messageText: msg.messageText },
    })
  }

  // 7. PLATFORM CONFIG
  const configs = [
    { key: 'free_credits_amount',            value: '5',   description: 'Number of free credits given to every new brand on signup' },
    { key: 'free_credits_expiry_days',       value: '30',  description: 'Number of days free credits are valid after brand signup' },
    { key: 'credit_price_per_unit',          value: '99',  description: 'Price per credit in INR that brands pay to purchase credits' },
    { key: 'commission_rate',                value: '5',   description: 'Platform commission percentage deducted from creator payout (e.g. 5 = 5%)' },
    { key: 'campaign_duration_days',         value: '5',   description: 'Number of days a campaign stays live before auto-expiring if no applications' },
    { key: 'delivery_window_default_days',   value: '14',  description: 'Default number of days brand has to deliver product to creator' },
    { key: 'delivery_window_max_days',       value: '30',  description: 'Maximum number of days brand can set for product delivery window' },
    { key: 'barter_credits_cost',            value: '5',   description: 'Number of credits a brand spends to post a barter campaign' },
    { key: 'barter_min_product_value',       value: '100', description: 'Minimum declared product value (INR) for barter campaigns' },
    { key: 'min_campaign_price',             value: '100', description: 'Minimum price per creator (INR) for paid campaigns' },
    { key: 'matchmaking_min_score',          value: '0',   description: 'Minimum matchmaking score for a creator to appear in results (0 = show all)' },
    { key: 'matchmaking_default_completion', value: '70',  description: 'Default deal completion rate (%) assumed for new creators with no history' },
    { key: 'deal_payment_window_hours',      value: '48',  description: 'Hours brand has to pay after price lock before deal auto-cancels' },
    { key: 'negotiation_timer_hours',        value: '48',  description: 'Hours each party has to respond in each negotiation round' },
    { key: 'dispute_window_days',            value: '7',   description: 'Days brand has to raise a dispute after creator marks content as posted' },
    { key: 'creator_silence_ban_hours',      value: '48',  description: 'Hours creator has to respond after brand marks product delivered before auto-ban' },
    { key: 'product_issue_review_hours',     value: '48',  description: 'Hours admin has to review a product issue before escalation alert' },
    { key: 'barter_review_hours',            value: '48',  description: 'Hours admin has to review a barter campaign before escalation alert' },
    { key: 'creator_approval_sla_hours',     value: '48',  description: 'Hours admin has to review a creator profile before SLA warning' },
    { key: 'pricing_lock_days',              value: '14',  description: 'Days a creator cannot change their pricing after each change' },
    { key: 'min_portfolio_videos',           value: '3',   description: 'Minimum number of portfolio videos a creator must upload' },
    { key: 'max_creator_categories',         value: '3',   description: 'Maximum number of categories a creator can select' },
    { key: 'max_campaign_slots',             value: '50',  description: 'Maximum number of slots (creators) allowed per campaign' },
    { key: 'max_barter_slots',               value: '20',  description: 'Maximum number of slots per barter campaign' },
    { key: 'content_auto_approve_hours',     value: '48',  description: 'Hours brand has to review concept/content before auto-approval' },
    { key: 'overdue_brand_response_hours',   value: '48',  description: 'Hours brand has to choose extend or dispute after creator goes overdue' },
    { key: 'min_age_years',                  value: '14',  description: 'Minimum age in years to create a creator account' },
    { key: 'bio_max_chars',                  value: '150', description: 'Maximum characters allowed in creator bio' },
    { key: 'brand_about_max_chars',          value: '250', description: 'Maximum characters allowed in brand about section' },
    { key: 'notification_expiry_days',       value: '90',  description: 'Days before in-app notifications are automatically deleted' },
    { key: 'credit_min_purchase',            value: '1',   description: 'Minimum number of credits a brand can purchase in one transaction' },
  ]
  for (const config of configs) {
    await prisma.platformConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: config,
    })
  }

  // 8. ADMIN ACCOUNT
  const adminPassword = await bcrypt.hash('Admin@123', 10)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@collabry.co'
  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', email: adminEmail, passwordHash: adminPassword },
  })

  console.log('Seed completed successfully')
  console.log('Admin login: username=admin, password=Admin@123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
