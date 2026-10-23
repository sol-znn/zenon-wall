import {createRouter, createWebHashHistory} from 'vue-router'

// Hash history: GitHub Pages has no rewrite rules, so a path URL would 404 on
// reload. #/?page=2 always lands on index.html.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {path: '/', name: 'wall', component: () => import('./pages/WallPage.vue')},
    {path: '/:pathMatch(.*)*', redirect: '/'},
  ],
  scrollBehavior: () => ({top: 0}),
})
